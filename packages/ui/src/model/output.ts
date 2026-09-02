import {
  action,
  atom,
  type Computed,
  computed,
  getCalls,
  isChanged,
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
import { detached, withOptionalComputed } from './reatom.js'
import type { InputsModel, OutputModel, RunModel, StudioDeps } from './types.js'

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
 * report already is. {@link OutputModel.copyState} and {@link OutputModel.downloadState} are what a
 * surface reads to draw the cell; the arms and the timings are imported from
 * `primitives/actionState.ts` rather than restated, because the artboard fixes both and there must
 * be exactly one statement of them.
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
    startId: InputsModel['startId']
    viewedSession: RunModel['viewedSession']
    viewedReport: RunModel['viewedReport']
    start: RunModel['start']
  },
  name: string,
): OutputModel {
  const { descriptor, viewedSession, viewedReport } = input

  /**
   * The node `2A`'s **closed** strip is about, on a page whose dock has never been opened — and,
   * now, the node a successful settle auto-opens the dock onto. See {@link viewerNodeId} for the
   * auto-open itself; this is only the derivation of *which* node.
   *
   * `2A`'s subtitle is *"output dock is dismissable (× or esc)"*, and dismissable implies
   * restorable: the artboard draws a closed state — a mono `Output` label and a `Show output`
   * button — as a strip at the bottom of the canvas column. That is the manual half, and it still
   * works exactly as before: a user who collapses the dock gets the strip back, naming this node.
   *
   * It is a **derivation of the report, not a second stored node**: a settled run that produced
   * something has a node the strip can name, and `Show output` — or the auto-open below — adopts
   * it.
   *
   * Which node: the **last** one that produced an asset, since that is what the artboard's own
   * strip summarises (`render.image · 3 files · run #221`), falling back to the last one that
   * produced a non-empty output. A node that produced neither — failed, skipped, or simply silent
   * — can be summarised only by inventing something, so it is passed over, and a report with no
   * such node draws no strip rather than an empty one.
   */
  const restorableNode = computed<WireNodeReportPayload | undefined>(() => {
    const report = viewedReport()
    if (report === undefined) return undefined
    let withAsset: WireNodeReportPayload | undefined
    let withOutput: WireNodeReportPayload | undefined
    for (const node of report.nodes) {
      if (Object.keys(node.assets).length > 0) withAsset = node
      else if (node.output !== null && Object.keys(node.output).length > 0) withOutput = node
    }
    return withAsset ?? withOutput
  }, `${name}.restorableNode`)

  /**
   * Which node the viewer is open on — stored, but not purely so: it now also **auto-opens**.
   *
   * **It closes on two things unconditionally, on a third conditionally, and now auto-opens on a
   * fourth — and all four are derivations rather than effects** (RTM-S02), so no frame ever paints
   * one run's output under another run's report:
   *
   *  - **A run beginning, unconditionally.** That is why `start` is an input at all: without it the
   *    viewer only *appears* to close, because `viewedReport` goes briefly `undefined` — and it
   *    silently reopens with no user action the moment the next report contains a node with the
   *    same id. Detected as `getCalls(input.start).length > 0`, which is true only in the pass a
   *    real call landed — a recompute this action had no part in reads back empty.
   *  - **The panel being pointed at another start, unconditionally.** `StudioApp.selectStart`
   *    closed the viewer by hand, and nothing else in the model layer could: `InputsModel` knows
   *    nothing about a viewer, and an open output is a statement about a run of the start that was
   *    selected when it was opened. Detected with `isChanged(input.startId)` rather than merely
   *    reading it, because both a start move and a plain session change recompute this atom — the
   *    two are told apart by whether `startId` ITSELF is what moved, not by whether the computed
   *    ran again. `startId` moves on a flow switch and on a mount seed too, and closing there is
   *    right for the same reason; a *reload* that keeps the selection (F10) does not move it, so
   *    the reload the conflict offer asks for leaves an open viewer alone.
   *  - **The run on screen changing, conditionally: closes on anything but a clean settle.** A
   *    failed or cancelled run, or a session still carrying its own `failure`, closes the viewer
   *    exactly as it always did.
   *  - **The run on screen changing to one that DID settle successfully — the fourth event, and the
   *    new one: it now auto-opens instead of closing.** A run that just streamed to completion, or
   *    a different already-settled run picked from history, adopts {@link restorableNode} the
   *    moment it becomes the viewed session — the same node `Show output` would have adopted by
   *    hand. This retires the standing ruling that opening was a deliberate act: the run panel's
   *    own inline `Outputs` section, which used to be the fallback route to the same fields, is
   *    gone (see `run/RunCompletedView/RunCompletedView.tsx` and R8 in `model/runPanel.ts`), so the
   *    dock is now the *only* place a run's output is shown, and it has to reach the screen without
   *    a click for nothing to be lost.
   */
  const viewerNodeId = atom<string | undefined>(undefined, `${name}.viewerNodeId`).extend(
    withOptionalComputed<string>((state) => {
      // Read as dependencies, not called: `getCalls` is how a computed observes an action.
      const startCalls = getCalls(input.start)
      const session = viewedSession()
      input.startId()
      // `isChanged` is what tells "the panel moved to another start" apart from "the session
      // changed while the start stayed put" — both recompute this atom, because both are read
      // here, but only the first must force a close regardless of what the new session says.
      const startIdChanged = isChanged(input.startId)
      if (isInit()) return state
      // A run beginning, or the panel moving to another start, close unconditionally — neither is
      // a session settling, so there is nothing here to auto-open onto.
      if (startCalls.length > 0 || startIdChanged) return undefined
      // A run still in flight, one that failed or was cancelled, or a fresh start all close the
      // viewer exactly as before. Only a session that settled with `report.status === 'ok'` — the
      // same criterion the retired inline Outputs section used — auto-opens onto its own node.
      if (session?.failure !== undefined || session?.report?.status !== 'ok') return undefined
      return restorableNode()?.nodeId
    }),
  )

  const openViewerNode = computed<WireNodeReportPayload | undefined>(() => {
    const nodeId = viewerNodeId()
    if (nodeId === undefined) return undefined
    return viewedReport()?.nodes.find((node) => node.nodeId === nodeId)
  }, `${name}.openViewerNode`)

  /**
   * What the dock draws, open or collapsed — the opened node while there is one, the restorable
   * node otherwise. One computed rather than two reads at the call site, because the surface is one
   * element in both states: `OutputDock` swaps its own class, and a shell that mounted the strip
   * and the dock separately would give the browser a new box to lay out instead of a height to
   * ease, and `4A`'s 180ms would be declared, mounted and dead.
   */
  const dockNode = computed<WireNodeReportPayload | undefined>(
    () => openViewerNode() ?? restorableNode(),
    `${name}.dockNode`,
  )

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
      const node = dockNode()
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
  /**
   * `10-output-dock.md` §4's `outputOpen`, inverted — the 34px strip instead of the 378px dock.
   *
   * It is not `viewerNodeId === undefined`. `2A`'s strip prints `render.image · 3 files · run #221`,
   * so a dock the user put away still knows what it is about, and `Show output` brings back the
   * same node rather than making the user find the card again. That is also what lets `4A`'s
   * 180ms height settle play at all: the dock is a surface that changes height, not one that comes
   * and goes.
   *
   * It resets to `false` on the same triggers {@link viewerNodeId} resets on, so a manual collapse
   * left over from a previous run cannot suppress the next run's auto-open: without this, a user who
   * had put a dock away, then ran again, would have `viewerNodeId` adopt the new node while
   * `collapsed` still said `true`, and `expanded` would stay `false` regardless. Every other case
   * this touches was already a no-op — everywhere `viewerNodeId` resets to `undefined` instead,
   * `expanded` is `false` either way, so forcing `collapsed` to `false` there changes nothing
   * observable.
   */
  const collapsed = atom(false, `${name}.collapsed`).extend(
    withComputed((state) => {
      getCalls(input.start)
      viewedSession()
      input.startId()
      return isInit() ? state : false
    }),
  )

  /**
   * Whether the dock is at full height — and the reason `collapsed` alone is not the answer.
   *
   * A dock that is about a node only because a run settled but never auto-opened — a run that
   * failed, was cancelled, or is still running — draws the strip, not the full dock: `viewerNodeId`
   * stays `undefined` in exactly that case, so `expanded` is `false` regardless of `collapsed`.
   * `collapsed` keeps meaning what it always meant — the dock's own dismiss — and it is the second
   * half of this, not the whole of it: a run that DID settle successfully sets `viewerNodeId` on its
   * own node and resets `collapsed` to `false` in the same pass, which is what makes `expanded` true
   * without a click.
   */
  const expanded = computed(() => viewerNodeId() !== undefined && !collapsed(), `${name}.expanded`)

  const open = action((nodeId: string) => {
    viewerNodeId.set(nodeId)
    collapsed.set(false)
  }, `${name}.open`)

  /**
   * `Show output`. From a dock the user put away it is `collapsed.set(false)` and nothing else;
   * from the strip a settled run raised on its own it is also the moment the viewer adopts
   * {@link restorableNode}, which is what makes the button the route into the output that `2A`
   * draws it as. A settled run with nothing to show has no strip, so there is no press to answer.
   */
  const expand = action(() => {
    if (viewerNodeId() === undefined) {
      const node = restorableNode()
      if (node === undefined) return
      viewerNodeId.set(node.nodeId)
    }
    collapsed.set(false)
  }, `${name}.expand`)

  const collapse = action(() => {
    collapsed.set(true)
  }, `${name}.collapse`)

  const close = action(() => {
    viewerNodeId.set(undefined)
    collapsed.set(false)
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
    collapsed.set(false)
    copyState.set('idle')
    downloadState.set('idle')
  }, `${name}.reset`)

  return {
    viewerNodeId,
    openViewerNode,
    dockNode,
    expanded,
    dockStrings,
    logs,
    collapsed,
    open,
    expand,
    collapse,
    close,
    copyAll,
    download,
    reset,
    copyState,
    downloadState,
  }
}
