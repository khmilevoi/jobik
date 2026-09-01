import {
  type Atom,
  action,
  atom,
  type Computed,
  computed,
  type Ext,
  getCalls,
  isInit,
  sleep,
  withAbort,
  withComputed,
  wrap,
} from '@reatom/core'
import type {
  SafeFlowDescriptorPayload,
  WireNodeReportPayload,
  WireRunReportPayload,
} from '#client/index.js'
import { ACTION_TIMINGS, type CopyState, type DownloadState } from '#primitives/index.js'
import { formatOutputContext, formatOutputSummary } from '#studio/format.js'
import { toRunLog } from '#studio/runPresenter.js'
import type { OutputModel, RunModel, StudioDeps } from './types.js'

/**
 * The output viewer, the `2A` bottom output dock, and `3A`'s copy and download sequences.
 *
 * `studio/format.ts` and `studio/runPresenter.ts` are reused exactly as they are: both were already
 * pure functions of a report or a session, and moving the state off React changes nothing they
 * compute. What moves here is everything `StudioApp` held around them — which node the viewer is
 * open on, when it closes, and the two button lifecycles `OutputHeader` drives today.
 *
 * ## The two states, and why they are on the model at all
 *
 * `3A` fixes copy and download as state matrices, and until now those matrices lived inside
 * `OutputHeader` through `useCopyAction` / `useDownloadAction`. The work they wrap — serialising a
 * report, writing the clipboard, holding `Copied` for 1.6 s — is not chrome, so it belongs where the
 * report already is. {@link OutputActionsModel} is what a surface reads to draw the cell; the arms
 * and the timings are imported from `primitives/actionState.ts` rather than restated, because the
 * artboard fixes both and there must be exactly one statement of them.
 *
 * **RTM-A05: every hold is `await wrap(sleep(ms))` inside an action extended with `withAbort()`,
 * never a `setTimeout`/`clearTimeout` pair.** That is what lets `reset` cancel a hold without a
 * handle to keep, and it is why nothing in this module owns a timer.
 *
 * `progress` is deliberately unreachable here. Nothing on the wire carries a byte count, so the
 * download stays on `3A` rule 03's indeterminate branch — spinner, then `Saved` — exactly as
 * `OutputHeader`'s own `DOWNLOAD_LABELS` already records. The arm stays in the imported union; this
 * surface simply never enters it.
 */

/**
 * What a surface reads to draw the two buttons — `3A`'s cells, as state rather than as a hook.
 *
 * Declared here rather than on {@link OutputModel}: the contract states the two **actions**, which
 * are what every caller invokes, and the wave that converts `primitives/actionState.ts` into
 * `reatomCopyAction` / `reatomDownloadAction` is what will decide where the cell itself finally
 * lives. Until then it is additive, the way `RunNodeModel` is additive to `RunModel`.
 */
export interface OutputActionsModel {
  /** `3A` §2 — `idle | busy | ok | failed`. `failed` is terminal until the next press. */
  readonly copyState: Atom<CopyState>
  /** `3A` §3 — `idle | busy | ok`, the indeterminate branch. See the note on `progress` above. */
  readonly downloadState: Atom<DownloadState>
}

/**
 * Both sequences are started and never awaited, so their rejections need an owner.
 *
 * The only rejection either can produce is the `AbortError` `withAbort()` raises when `reset` or a
 * newer press supersedes it — a cancelled hold is the machine working, not a failure. The clipboard
 * write's own rejection is caught where it happens, because that one is a domain outcome: `3A`'s
 * `failed` cell.
 */
function detached(promise: Promise<unknown>): void {
  void promise.catch(() => {})
}

/**
 * `withComputed` cannot type an `Atom<T | undefined>`: `AtomState<Target>` infers off `AtomLike`'s
 * **optional** `__state?`, so TypeScript strips the `undefined` and the compute callback is typed
 * `(state: T) => T`. Copied from `model/inputs.ts`, which carries the original — it wants hoisting
 * into one shared place once a wave owns both files.
 */
function withOptionalComputed<T>(
  compute: (state: T | undefined) => T | undefined,
): Ext<Atom<T | undefined>> {
  return withComputed<Atom<T | undefined>>(compute as unknown as (state: T) => T)
}

/** A stable identity for the common case, so an empty log does not invalidate its readers. */
const NO_LOGS: readonly { readonly time: string; readonly message: string }[] = []

/**
 * Writes the report to disk, as the dock's own `Download` button does.
 *
 * Returns its failure rather than throwing it, per the repository's `errore` convention: an
 * environment with no `Blob` or no `URL.createObjectURL` is a real answer the sequence has to render
 * — as a return to idle, since `3A` draws no failed cell for a download — not an unexpected throw.
 */
function writeDownload(report: WireRunReportPayload, nodeId: string): Error | undefined {
  try {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = globalThis.URL.createObjectURL(blob)
    const link = globalThis.document.createElement('a')
    link.href = url
    link.download = `${nodeId}-run-${report.runNumber}.json`
    link.click()
    globalThis.URL.revokeObjectURL(url)
    return undefined
  } catch (error) {
    // No Blob/URL.createObjectURL support in this environment. `Copy all` is the fallback; there is
    // nothing more useful to do client-side.
    return error instanceof Error ? error : new Error(String(error))
  }
}

/**
 * `deps` is on the signature because the contract declares it and `reatomStudio` wires every factory
 * the same way; nothing here reads it. The two writes this module performs — the clipboard and the
 * download — are browser APIs rather than client calls, and `assetUrl` belongs to the components
 * `StudioApp` hands `deps` to directly.
 */
export function reatomOutput(
  _deps: StudioDeps,
  input: {
    descriptor: Computed<SafeFlowDescriptorPayload | undefined>
    viewedSession: RunModel['viewedSession']
    viewedReport: RunModel['viewedReport']
    start: RunModel['start']
  },
  name: string,
): OutputModel & OutputActionsModel {
  const { descriptor, viewedSession, viewedReport } = input

  /**
   * Which node the viewer is open on — stored, never derived from the report.
   *
   * **It closes on two things, and both are derivations rather than effects** (RTM-S02), so no frame
   * ever paints one run's output under another run's report:
   *
   *  - **A run beginning.** That is why `start` is an input at all: without it the viewer only
   *    *appears* to close, because `viewedReport` goes briefly `undefined` — and it silently reopens
   *    with no user action the moment the next report contains a node with the same id.
   *  - **The run on screen changing.** `RunModel.selectRun` makes one write and deliberately does
   *    not touch the viewer, because the open output belongs to the run that produced it and that
   *    side is this module's; a session identity change is exactly that event, and it needs no
   *    second input to observe.
   */
  const viewerNodeId = atom<string | undefined>(undefined, `${name}.viewerNodeId`).extend(
    withOptionalComputed<string>((state) => {
      // Read as dependencies, not called: `getCalls` is how a computed observes an action.
      getCalls(input.start)
      viewedSession()
      return isInit() ? state : undefined
    }),
  )

  const openViewerNode = computed<WireNodeReportPayload | undefined>(() => {
    const nodeId = viewerNodeId()
    if (nodeId === undefined) return undefined
    return viewedReport()?.nodes.find((node) => node.nodeId === nodeId)
  }, `${name}.openViewerNode`)

  /**
   * `2A`'s two mono strings — `render.image · Buffer[3] · run #221` open, and
   * `render.image · 3 files · run #221` collapsed.
   *
   * Every part is read off the report and the descriptor: the node, its first asset-bearing output
   * field, that field's own annotation, how many asset fields the node actually produced, and the
   * run number. A node that produced no asset falls to the short form rather than a fabricated one.
   */
  const dockStrings = computed<{ readonly context: string; readonly summary: string } | undefined>(
    () => {
      const node = openViewerNode()
      if (node === undefined) return undefined
      const report = viewedReport()
      const fields = Object.keys(node.assets)
      const field = fields[0]
      const annotation = descriptor()
        ?.nodes.find((entry) => entry.id === node.nodeId)
        ?.output.fields.find((entry) => entry.field === field)?.annotation
      const args = {
        nodeId: node.nodeId,
        fileCount: fields.length,
        ...(field === undefined ? {} : { field }),
        ...(report === undefined ? {} : { runNumber: report.runNumber }),
      }
      return {
        context: formatOutputContext({
          ...args,
          ...(annotation === undefined ? {} : { annotation }),
        }),
        summary: formatOutputSummary(args),
      }
    },
    `${name}.dockStrings`,
  )

  const logs = computed<readonly { readonly time: string; readonly message: string }[]>(() => {
    const session = viewedSession()
    if (session === undefined) return NO_LOGS
    return toRunLog(session).lines.map((line) => ({ time: line.time, message: line.text }))
  }, `${name}.logs`)

  /**
   * `open` and `close` are the named transitions the contract puts on the model, not the identity
   * setters RTM-S01 forbids: a settled card's `Inspect`, `esc` and the dock's own dismiss all name
   * the same one instead of each reaching for `viewerNodeId.set` and inventing its own idea of what
   * opening the viewer costs.
   */
  const open = action((nodeId: string) => {
    viewerNodeId.set(nodeId)
  }, `${name}.open`)

  const close = action(() => {
    viewerNodeId.set(undefined)
  }, `${name}.close`)

  const copyState = atom<CopyState>('idle', `${name}.copyState`)

  /**
   * `3A` rule 01 — armed, and usually cancelled before it ever fires. The spinner is what a slow
   * *serialisation* looks like, not what a copy looks like: a synchronous clipboard write settles
   * long inside `copySpinnerDelayMs`, and `_copy` aborts this before it can show anything.
   */
  const _armCopySpinner = action(async () => {
    await wrap(sleep(ACTION_TIMINGS.copySpinnerDelayMs))
    copyState.set('busy')
  }, `${name}._armCopySpinner`).extend(withAbort())

  /**
   * `3A` §4.1's copy script: swap to `ok`, hold `copiedHoldMs`, return to idle. A failure lands on
   * `failed` and stays there — the design draws no timed exit from that cell, and its own label,
   * `Copy failed — retry`, says what does clear it.
   */
  const _copy = action(async (text: string) => {
    detached(_armCopySpinner())
    let failed = false
    try {
      const write = globalThis.navigator?.clipboard?.writeText(text)
      // No clipboard API at all is a failure, not a silent success: nothing was written, and `3A`'s
      // failed cell is the one honest thing to draw.
      if (write === undefined) failed = true
      else await wrap(write)
    } catch {
      failed = true
    }
    _armCopySpinner.abort()
    if (failed) {
      copyState.set('failed')
      return
    }
    copyState.set('ok')
    await wrap(sleep(ACTION_TIMINGS.copiedHoldMs))
    copyState.set('idle')
  }, `${name}._copy`).extend(withAbort())

  /**
   * R33: `Copy all` acts on the payload the `Raw` tab renders, not on `close`. Both buttons were
   * once wired to closing the viewer, so neither did what it said and dismissing the dock required
   * pressing a button labelled `Copy all`.
   *
   * The press is refused while the spinner shows and while `Copied` still stands, and accepted from
   * `failed` — `3A` §2.5's one deliberate exception. The guard is the domain state rather than
   * `.ready()`, which reads stale inside a single synchronous tick. Two presses *inside* one tick,
   * before either cell has been written, are the window `3A`'s own script leaves open and the hook
   * has today: the second costs one more identical clipboard write, and `withAbort()` drops the
   * first frame rather than letting two holds race.
   */
  const copyAll = action(() => {
    const cell = copyState()
    if (cell === 'busy' || cell === 'ok') return
    const report = viewedReport()
    if (report === undefined) return
    detached(_copy(JSON.stringify(report, null, 2)))
  }, `${name}.copyAll`)

  const downloadState = atom<DownloadState>('idle', `${name}.downloadState`)

  /**
   * The write, then `3A` §4.1's `later(1800, …)`: `Saved` stands `savedHoldMs` and the button
   * returns to idle. The write is awaited through `wrap` rather than performed inline, so `busy` is
   * a cell the surface actually gets to draw — the same shape `OutputHeader.runDownload` has today.
   */
  const _download = action(async (report: WireRunReportPayload, nodeId: string) => {
    const failure = await wrap(Promise.resolve(writeDownload(report, nodeId)))
    if (failure !== undefined) {
      // `3A` draws no failed cell for a download, so a failure returns the button to idle rather
      // than inventing chrome the design does not have.
      downloadState.set('idle')
      return
    }
    downloadState.set('ok')
    await wrap(sleep(ACTION_TIMINGS.savedHoldMs))
    downloadState.set('idle')
  }, `${name}._download`).extend(withAbort())

  /**
   * The dock's `Download`, on the same payload as `Copy all` and named for the node it was opened
   * from. `busy` is written here, synchronously, which is also what makes a second press a no-op.
   */
  const download = action(() => {
    if (downloadState() !== 'idle') return
    const report = viewedReport()
    const node = openViewerNode()
    if (report === undefined || node === undefined) return
    downloadState.set('busy')
    detached(_download(report, node.nodeId))
  }, `${name}.download`)

  /**
   * What a flow switch calls — one of the twelve `reset`s `FlowSwitchModel.switchTo` performs in a
   * single batch. Both sequences are aborted rather than left running: a hold that outlived its flow
   * would return a button to idle inside a flow that never pressed it.
   */
  const reset = action(() => {
    _copy.abort()
    _armCopySpinner.abort()
    _download.abort()
    viewerNodeId.set(undefined)
    copyState.set('idle')
    downloadState.set('idle')
  }, `${name}.reset`)

  return {
    viewerNodeId,
    openViewerNode,
    dockStrings,
    logs,
    open,
    close,
    copyAll,
    download,
    reset,
    copyState,
    downloadState,
  }
}
