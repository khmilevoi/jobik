import type { Computed } from '@reatom/core'
import { action, atom, bind, computed, sleep, withAbort, wrap } from '@reatom/core'
import type { SafeFlowDescriptorPayload, WireRunReportPayload } from '#client/index.js'
import type { StackTraceMetaEntry, StackTraceView } from '#modals/index.js'
import { groupDigits, resolveTypedValueTone } from '#output/index.js'
import { ACTION_TIMINGS } from '#primitives/index.js'
import type {
  RunErrorDetail,
  RunInputForm,
  RunLog,
  RunNodeTiming,
  RunOutputField,
  RunPanelState,
  RunStack,
  RunStackFrame,
  RunSummary,
} from '#run/index.js'
import { formatHiddenFrames, formatRunMeta } from '#run/index.js'
import type { RunDockMetaTone, RunDockStatus } from '#shell/index.js'
import { formatElapsed } from '#studio/format.js'
import {
  toRunErrorDetail,
  toRunLog,
  toRunNodeTimings,
  toRunStack,
  toRunSummary,
} from '#studio/runPresenter.js'
import type { RunSession } from '#studio/runSession.js'
import { completedNodeCount } from '#studio/runSession.js'
import { toProse } from '#studio/validation.js'
import { detached } from './reatom.js'
import type {
  InputsModel,
  OutputModel,
  RunModel,
  RunPanelModel,
  StudioDeps,
  ValidationModel,
} from './types.js'

/**
 * The dock's body and its one header.
 *
 * `studio/runPresenter.ts` is still the projection — `toRunNodeTimings`, `toRunLog`,
 * `toRunErrorDetail`, `toRunStack` and `toRunSummary` are consumed here exactly as they are, from
 * inside `computed` bodies — so every rule those functions state is still stated once. What moved
 * is only *when* each of them runs.
 *
 * ## Why this is many computeds and not one memo
 *
 * `StudioApp.runPanelState` was a single `useMemo` whose dependency list named `studio.elapsedMs`,
 * and `elapsedMs` advances every `TICK_MS = 100`. So ten times a second, for the whole length of a
 * run, that memo re-mapped **the entire run log and every node timing** — to print one string that
 * had changed by a tenth of a second.
 *
 * The split below is the fix, and it is the whole of it: the four branches the surface already
 * models keep their shapes, but every expensive projection is its own `computed` over its own
 * source. The clock reaches {@link RunPanelModel.state} — which must reassemble, because
 * `RunRunningState.elapsed` is part of it — and nothing else. `_runningNodes` and `_runningLog` do
 * not read the clock, so a tick cannot invalidate them and `state` gets the same two values back at
 * the same two identities. `meta` and `dockStatus` are derived from `_kind` and the run numbers
 * rather than from `state`, so the tick never reaches them at all: while a run is in flight the
 * dock header reads `#219` and publishes that once.
 *
 * **`state` reads the clock inside the running branch only** (RTM-C01's shape: read after the
 * guard, not before it). Reatom collects a computed's dependencies per run, so a settled or idle
 * panel does not depend on `elapsedMs` — which is also what lets `model/run.ts`'s connect hook stop
 * the 100ms loop the moment the last reader of the clock goes away.
 *
 * R9: the settled states are guarded on a session rather than fabricated. A settled run — streamed
 * or rejected outright — always leaves one populated by the time `running` goes back to `false`;
 * nothing here invents a `RunSession` shape to satisfy the compiler.
 */

/** Which of the four bodies the panel is drawing, or none at all. */
type RunPanelKind = 'idle' | 'running' | 'failed' | 'completed'

/**
 * `### Run panel`'s idle note, and `Run panel — states`' running one.
 *
 * `StudioApp` no longer carries a copy — it renders the state this module builds — and the last
 * duplicate went with `studio/useStudioSession.ts` when that file was deleted. These are the only
 * copies. The `run/` tests that assert the rendered line spell it out for themselves rather than
 * importing it, because these are private to this module.
 */
const IDLE_NOTE =
  'Inputs are typed from the flow declaration. Only downstream nodes of the selected entry point run.'

const RUNNING_NOTE =
  'Streaming output as each node settles. Inputs are locked for the duration of the run.'

/**
 * The empty answers, as module constants rather than fresh literals.
 *
 * A `computed` that rebuilt `[]` on every recomputation would publish a new identity every time,
 * which is the churn this module exists to remove — and `RunNodeTimings` and `RunLogSection` are
 * handed these values straight.
 */
const NO_ORDER: readonly string[] = []
const NO_TIMINGS: readonly RunNodeTiming[] = []
const NO_LOG: RunLog = { lines: [], followLabel: 'follow' }
const NO_TAIL: RunLog = { lines: [], followLabel: 'tail' }
const NO_PROGRESS = { completedNodes: 0, totalNodes: 0, progress: 0 }

const NO_FRAMES: readonly RunStackFrame[] = []
const NO_META: readonly StackTraceMetaEntry[] = []
const NO_OUTPUTS: readonly RunOutputField[] = []

/**
 * R8 — `Run panel — states`' completed `Outputs` group, built from the report and from nothing else.
 *
 * ## What the artboard lists, and what it does not
 *
 * The card draws three rows for run `#221` — `image`, `caption`, `url` — while its own `Log` block
 * one artboard over records a fourth field on the same run: `start1 → emit title, markdown`. So
 * the group is **every node's output except the entry point's**, and that exclusion is the
 * artboard's, not an invention: a start node's "output" is the run's input, and `2A` already draws
 * those two fields as the editable form directly above this section. Listing them again would
 * print the same two values twice in one panel.
 *
 * ## What is filled, and what is left out
 *
 * * **`field`** — the output field's own name, from the report.
 * * **`asset`** — the `AssetDescriptor` the server put in place of the bytes. The view's default
 *   meta line is `formatAssetMeta`, which is `png · 412 kb`. The artboard's own line is
 *   `png · 1024² · 412 kb`; **the dimensions are not filled**, because `AssetDescriptor` carries
 *   `type`, `mime`, `bytes` and `id` and nothing else (`DEFERRED.md`: no dimensions, no colour
 *   profile, no checksum). No zero, no placeholder — the cell is simply two parts wide.
 * * **`src`** — `client.assetUrl(descriptor)`, the same URL the output dock's own image reads. Real.
 * * **`Open`** — opens the output dock on the node that produced the field, which is the one
 *   affordance the artboard's button can honestly mean here.
 * * **the typed rows** — every non-asset field, with `resolveTypedValueTone` deciding the accent
 *   `url` well from the muted text one. That is the output viewer's own rule, reused rather than
 *   restated, so `cdn.jobik.dev/…` reads the same in both surfaces. `number`/`opaque` have no well
 *   of their own on this card, so they take the text one, and a number is grouped by `groupDigits`
 *   exactly as `TypedValueGrid` groups it.
 *
 * A field whose value is neither a string nor a number is passed over rather than stringified:
 * the artboard has one-line and one-paragraph wells and no shape for an object, and `Open` on the
 * node beside it reaches the viewer that does.
 */
function toCompletedOutputs(args: {
  report: WireRunReportPayload
  entryNodeId: string
  assetUrl: (asset: WireRunReportPayload['nodes'][number]['assets'][string]) => string
  openOutput: (nodeId: string) => void
}): readonly RunOutputField[] {
  const nodes = args.report.nodes.filter((node) => node.nodeId !== args.entryNodeId)

  // A field name is unique across the whole run in every showcase flow, and the artboard prints
  // bare names. Two nodes really can declare the same one, though, and two rows both reading
  // `url` would be a lie about which node produced which — so a collision, and only a collision,
  // qualifies both with the node that owns them.
  const counts = new Map<string, number>()
  for (const node of nodes) {
    for (const field of new Set([...Object.keys(node.assets), ...Object.keys(node.output ?? {})])) {
      counts.set(field, (counts.get(field) ?? 0) + 1)
    }
  }
  const label = (nodeId: string, field: string): string =>
    (counts.get(field) ?? 0) > 1 ? `${nodeId}.${field}` : field

  const fields: RunOutputField[] = []
  for (const node of nodes) {
    // `assets` is read as the authority rather than `output`, even though `serialiseNodeOutput`
    // writes the descriptor into both: `output` is `null` for a node that produced nothing JSON
    // could carry, and the bytes it produced are still on `assets`.
    for (const [field, asset] of Object.entries(node.assets)) {
      fields.push({
        kind: 'asset',
        field: label(node.nodeId, field),
        asset,
        src: args.assetUrl(asset),
        onOpen: () => args.openOutput(node.nodeId),
      })
    }
    for (const [field, value] of Object.entries(node.output ?? {})) {
      if (node.assets[field] !== undefined) continue
      if (typeof value === 'number') {
        fields.push({ kind: 'text', field: label(node.nodeId, field), value: groupDigits(value) })
        continue
      }
      if (typeof value !== 'string') continue
      fields.push({
        kind: resolveTypedValueTone(value) === 'url' ? 'url' : 'text',
        field: label(node.nodeId, field),
        value,
      })
    }
  }
  return fields
}

/** `3C` Modal C's header line — `render · run #220 · 0.8s`. An unnamed node drops its own segment. */
function traceContext(nodeId: string, runNumber: number, elapsed: string): string {
  const run = `run #${runNumber} · ${elapsed}`
  return nodeId === '' ? run : `${nodeId} · ${run}`
}

/**
 * The one meta row both halves of which are on the wire. See {@link RunPanelModel.trace} for the
 * two that are not and why they are absent rather than filled.
 */
function traceMeta(
  descriptor: SafeFlowDescriptorPayload | undefined,
  nodeId: string,
): readonly StackTraceMetaEntry[] {
  if (nodeId === '') return NO_META
  const node = descriptor?.nodes.find((entry) => entry.id === nodeId)
  return [
    {
      label: 'node',
      value: node === undefined ? nodeId : `${nodeId} · ${node.kind}`,
      tone: 'lifted',
    },
  ]
}

/** What `Copy` writes and what `Save trace` saves: the header line, the error, then the frames. */
function toTraceText(
  detail: { readonly error: RunErrorDetail; readonly stack: RunStack | undefined },
  context: string,
): string {
  const lines = [context, '', `${detail.error.name}: ${detail.error.message}`]
  for (const frame of detail.stack?.frames ?? NO_FRAMES) {
    lines.push(`    at ${frame.fn} (${frame.file}:${frame.line})`)
  }
  return `${lines.join('\n')}\n`
}

/** `render-run-220-trace.txt`, named as `model/output.ts` names the report it downloads. */
function traceFileName(nodeId: string, runNumber: number): string {
  return `${nodeId === '' ? 'run' : nodeId}-run-${runNumber}-trace.txt`
}

/**
 * The anchor-click write, identical in shape to `model/output.ts`'s `writeDownload` and failing the
 * same way: an environment with no `Blob` or no `URL.createObjectURL` writes nothing and says so by
 * doing nothing, because `3C` draws this button no failed cell.
 */
function writeTrace(text: string, fileName: string): void {
  try {
    const blob = new Blob([text], { type: 'text/plain' })
    const url = globalThis.URL.createObjectURL(blob)
    const link = globalThis.document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    globalThis.URL.revokeObjectURL(url)
  } catch {
    // No Blob/URL.createObjectURL here. `Copy` is the fallback, and it is beside this button.
  }
}

/**
 * `Copy log` on the failed card. It reads nothing reactive — the session it copies is the one the
 * `computed` that built the handler was looking at — so it needs no frame of its own.
 */
function copyRunLog(session: RunSession): void {
  void globalThis.navigator?.clipboard?.writeText(
    toRunLog(session)
      .lines.map((line) => `${line.time} ${line.text}`)
      .join('\n'),
  )
}

/**
 * `deps` is read for one thing only — `client.assetUrl`, which turns R8's `AssetDescriptor` into the
 * URL its thumbnail loads. Everything else here is a pure projection of the models this factory is
 * handed. It performs no request of its own; `assetUrl` composes a path and does not fetch.
 */
export function reatomRunPanel(
  deps: StudioDeps,
  input: {
    descriptor: Computed<SafeFlowDescriptorPayload | undefined>
    inputs: InputsModel
    run: RunModel
    blocked: ValidationModel['blocked']
    /** R8's `Open`: the same transition a settled card's `inspect` names, never a second one. */
    openOutput: OutputModel['open']
  },
  name: string,
): RunPanelModel {
  const { descriptor, inputs, run, blocked } = input

  /**
   * RTM-A04: `onOpen` rides inside model data and is invoked later by a React `onClick`, which runs
   * outside every frame. The frame is attached here, once, exactly as `model/canvas.tsx` does it.
   */
  const openOutput = bind(input.openOutput)

  /**
   * Declaration order, which is what the panel lists node timings in — not the traversal order the
   * run graph happens to have been built in, and not the report's.
   */
  const _order = computed<readonly string[]>(() => {
    const current = descriptor()
    return current === undefined ? NO_ORDER : current.nodes.map((node) => node.id)
  }, `${name}._order`)

  /** The run whose stream is still open, if there is one. `undefined` is the whole of "not live". */
  const _live = computed<RunSession | undefined>(
    () => (run.running() ? run.session() : undefined),
    `${name}._live`,
  )

  /**
   * The settled run the panel is entitled to draw: the one on screen, once nothing is in flight and
   * F07 says the report still belongs to the start the panel is pointed at. A row picked from
   * `Run history` is `settledRunIsCurrent`'s own deliberate exception and arrives here too.
   */
  const _settled = computed<RunSession | undefined>(() => {
    if (_live() !== undefined) return undefined
    if (!run.settledRunIsCurrent()) return undefined
    return run.viewedSession()
  }, `${name}._settled`)

  /**
   * Which body, as one small value every other unit in this file keys off.
   *
   * It reads sessions rather than projections, so it recomputes on every stream line — and answers
   * the same word, which Reatom compares with `Object.is` and does not propagate. That is the point
   * of splitting it out: `meta` and `dockStatus` hang off this and are woken only by a genuine
   * change of state, never by a log line and never by the clock.
   */
  const _kind = computed<RunPanelKind | undefined>(() => {
    if (descriptor() === undefined) return undefined
    if (inputs.startNode() === undefined || inputs.startId() === undefined) return undefined
    if (_live() !== undefined) return 'running'
    const settled = _settled()
    if (settled === undefined) return 'idle'
    // A run with no report, a report that is not `ok`, or a failure R25 routed onto the session:
    // all three are the failed card, and `session.failure` is why a rejected start reaches it.
    if (settled.failure !== undefined || settled.report?.status !== 'ok') return 'failed'
    return 'completed'
  }, `${name}._kind`)

  const _failedSession = computed<RunSession | undefined>(
    () => (_kind() === 'failed' ? _settled() : undefined),
    `${name}._failedSession`,
  )

  /**
   * R7 — the failed card, but for a run the user stopped rather than one that broke.
   *
   * `WireRunReportPayload.status` is `'ok' | 'failed' | 'cancelled'` and `model/toast.ts` has read
   * the third arm all along; the panel and the history row collapsed it into `failed`, so the same
   * run said `cancelled` in the toast and `failed` in the two surfaces beside it. Nothing new is
   * asked of the wire here — this is the report the card is already drawing, read one field wider.
   *
   * A session carrying `failure` is excluded: that is a `run-failed` line or a cancel *request*
   * that itself failed (R27), neither of which is a run that cancelled cleanly.
   */
  const _cancelled = computed<boolean>(() => {
    const failed = _failedSession()
    if (failed === undefined) return false
    return failed.failure === undefined && failed.report?.status === 'cancelled'
  }, `${name}._cancelled`)

  const _completedSession = computed<RunSession | undefined>(
    () => (_kind() === 'completed' ? _settled() : undefined),
    `${name}._completedSession`,
  )

  /**
   * The `#219` the dock header prints, per branch. A running run takes its number from the stream's
   * `run-started` line; a settled one from the run it is showing.
   */
  const _runNumber = computed<number>(() => {
    const kind = _kind()
    if (kind === 'running') return _live()?.runNumber ?? 0
    if (kind === 'failed') return _failedSession()?.runNumber ?? 0
    if (kind === 'completed') return run.viewedReport()?.runNumber ?? 0
    return 0
  }, `${name}._runNumber`)

  /** The settled elapsed, which is the run's own reported time and never the clock's. */
  const _settledElapsed = computed<string>(() => {
    const kind = _kind()
    if (kind === 'failed') return formatElapsed(_failedSession()?.report?.elapsedMs ?? 0)
    if (kind === 'completed') return formatElapsed(run.viewedReport()?.elapsedMs ?? 0)
    return formatElapsed(0)
  }, `${name}._settledElapsed`)

  /**
   * **The one unit besides `state` that the 100ms tick reaches.**
   *
   * It is a `computed` rather than a `formatElapsed` call inside `state` so the rounding dedupes:
   * `elapsedMs` advances by a raw millisecond count and this is one decimal of a second, so two
   * ticks that land inside the same tenth publish nothing at all.
   */
  const _elapsed = computed(() => formatElapsed(run.elapsedMs()), `${name}._elapsed`)

  const _runningNodes = computed<readonly RunNodeTiming[]>(() => {
    const session = _live()
    return session === undefined ? NO_TIMINGS : toRunNodeTimings(session, _order())
  }, `${name}._runningNodes`)

  const _runningLog = computed<RunLog>(() => {
    const session = _live()
    return session === undefined ? NO_LOG : toRunLog(session)
  }, `${name}._runningLog`)

  /**
   * `Run panel — states`' `1 of 3` and its percentage. Nothing in the stream reports sub-node
   * progress, so the bar is derived from the same two counts rather than invented.
   */
  const _runningProgress = computed(() => {
    const session = _live()
    if (session === undefined) return NO_PROGRESS
    const total = session.nodeCount > 0 ? session.nodeCount : _order().length
    const completed = completedNodeCount(session)
    return {
      completedNodes: completed,
      totalNodes: total,
      progress: total > 0 ? completed / total : 0,
    }
  }, `${name}._runningProgress`)

  const _failedNodes = computed<readonly RunNodeTiming[]>(() => {
    const session = _failedSession()
    return session === undefined ? NO_TIMINGS : toRunNodeTimings(session, _order())
  }, `${name}._failedNodes`)

  /**
   * The failed card's error block and its `3C` stack, from whichever surface carried the failure:
   * a failed node's error, then the run's own `failure`, then the report's. Nothing here re-tags or
   * re-humanises what arrived.
   *
   * **It is public because `3C`'s Stack trace dialog is the second reader.** `state`'s failed
   * branch is one; {@link trace} is the other, and both want the same pair rather than two
   * derivations that could disagree about which surface carried the failure.
   *
   * ## R9 — the two halves must come from the SAME payload
   *
   * This used to search `failure`, then `report.error`, then any node carrying an error, while
   * `toRunErrorDetail` — the other half of the very same object — searches a **failed** node
   * first and only then the run-level pair. The two orders are opposites, so a session that has
   * both (R27's cancel-request failure beside a node that really broke) rendered one error's name
   * and message over another error's frames, in the panel and in `3C` alike. The predicate below
   * is `toRunErrorDetail`'s, restated so the pair cannot disagree: the same `status === 'failed'`
   * filter, which is also what keeps a *skipped* node's `UpstreamFailedError` — a real payload,
   * carried by every downstream node of a failure — from being read as the failure itself.
   */
  const failedDetail = computed<
    { readonly error: RunErrorDetail; readonly stack: RunStack | undefined } | undefined
  >(() => {
    const failed = _failedSession()
    if (failed === undefined) return undefined
    const payload =
      [...failed.nodes.values()].find((node) => node.status === 'failed' && node.error !== null)
        ?.error ??
      failed.failure ??
      failed.report?.error ??
      undefined
    return {
      error: toRunErrorDetail(failed),
      stack: payload === undefined || payload === null ? undefined : toRunStack(payload),
    }
  }, `${name}.failedDetail`)

  const _completedNodes = computed<readonly RunNodeTiming[]>(() => {
    const session = _completedSession()
    return session === undefined ? NO_TIMINGS : toRunNodeTimings(session, _order())
  }, `${name}._completedNodes`)

  /**
   * `2A`'s `Log` / `tail` block, which is the running `Live log` with the other follow label.
   *
   * The label is no longer re-stated here: `toRunLog` reads it off the session, and a completed
   * session is settled by definition. `NO_TAIL` stays, because there is no session to ask.
   */
  const _completedLog = computed<RunLog>(() => {
    const session = _completedSession()
    return session === undefined ? NO_TAIL : toRunLog(session)
  }, `${name}._completedLog`)

  /**
   * R8's `Outputs` group, over the completed session's own report.
   *
   * Its own computed rather than a branch of `state`, for this file's standing reason: a report
   * lands once and nothing afterwards touches it, so the rows are built once per settled run and
   * come back at the same identity for every later read.
   */
  const _completedOutputs = computed<readonly RunOutputField[]>(() => {
    const report = _completedSession()?.report
    const entryNodeId = inputs.startId()
    if (report === undefined || entryNodeId === undefined) return NO_OUTPUTS
    return toCompletedOutputs({
      report,
      entryNodeId,
      assetUrl: (asset) => deps.client.assetUrl(asset),
      openOutput,
    })
  }, `${name}._completedOutputs`)

  /** `Studio — default`'s `Last run` block — whatever run is on screen, current start or not. */
  const _lastRun = computed<RunSummary | undefined>(() => {
    const report = run.viewedReport()
    return report === undefined ? undefined : toRunSummary(report)
  }, `${name}._lastRun`)

  /**
   * The typed input form, shared by the states that draw it — `2A` re-shows the inputs on the
   * completed dock and on the failed card, still editable, and the idle state has drawn them all
   * along. One unit, so a keystroke rebuilds one object rather than three.
   */
  const _inputForm = computed<RunInputForm | undefined>(() => {
    const node = inputs.startNode()
    if (node === undefined) return undefined
    const presentation = inputs.presentation()
    return {
      descriptor: node.input,
      draft: inputs.inputDraft(),
      ...(presentation === undefined ? {} : { presentation }),
      onDraftChange: inputs.setInputField,
    }
  }, `${name}._inputForm`)

  // The return type is annotated on the callback rather than passed as `computed`'s type argument:
  // a type argument does not contextually type the body, so `kind: 'running'` would widen to
  // `string` and no branch would satisfy `RunPanelState`.
  const state = computed((): RunPanelState | undefined => {
    const kind = _kind()
    if (kind === undefined) return undefined
    // `_kind` already answered `undefined` for either of these; they are read again because they
    // are what the bodies below are built out of, and the compiler cannot inherit a guard.
    const entryNodeId = inputs.startId()
    const startNode = inputs.startNode()
    if (entryNodeId === undefined || startNode === undefined) return undefined

    if (kind === 'running') {
      const progress = _runningProgress()
      return {
        kind: 'running',
        runNumber: _runNumber(),
        // The clock, read here and nowhere else in this body: everything around it was computed
        // from the session and comes back at the identity it already had.
        elapsed: _elapsed(),
        completedNodes: progress.completedNodes,
        totalNodes: progress.totalNodes,
        progress: progress.progress,
        note: RUNNING_NOTE,
        nodes: _runningNodes(),
        log: _runningLog(),
        partialOutput: true,
        onCancel: run.askToCancel,
      }
    }

    if (kind === 'failed') {
      const failed = _failedSession()
      const detail = failedDetail()
      if (failed === undefined || detail === undefined) return undefined
      const form = _inputForm()
      return {
        kind: 'failed',
        runNumber: _runNumber(),
        elapsed: _settledElapsed(),
        error: detail.error,
        ...(_cancelled() ? { cancelled: true } : {}),
        nodes: _failedNodes(),
        entryNodeId,
        ...(detail.stack === undefined ? {} : { stack: detail.stack }),
        ...(form === undefined ? {} : { inputs: form }),
        onCopyLog: () => copyRunLog(failed),
        onRerun: run.runFromDraft,
      }
    }

    if (kind === 'completed') {
      const form = _inputForm()
      const outputs = _completedOutputs()
      // R8. Both completed artboards are drawn here, in the order `RunCompletedView` fixes: `2A`'s
      // timings, editable inputs, `Re-run start1 ⌘↵` and `Log` / `tail`, with `Run panel — states`'
      // `Outputs` group between the inputs and the primary.
      //
      // The two artboards are not in conflict about the *data*, only about where it is reachable
      // from. `2A` is the newer, and it draws this panel beside an OPEN output dock — a page on
      // which the run's outputs are already on screen in full. `Run panel — states` draws the same
      // run's 320px dock standing alone, with no output dock anywhere, and there the panel is the
      // only place the outputs exist at all. The Studio spends most of its time in the second
      // situation: `model/output.ts` opens the dock from a settled card's `inspect` and from
      // nothing else, so a user who has not found that link has, until now, finished a run and
      // been shown its timings and no result. That is the gap R8 recorded twice.
      //
      // The cost is that a page with the dock open states the fields in both places. That is what
      // the older artboard's own card does, and it is the smaller error of the two: a value
      // repeated is worse than a value that cannot be found.
      return {
        kind: 'completed',
        runNumber: _runNumber(),
        elapsed: _settledElapsed(),
        nodes: _completedNodes(),
        entryNodeId,
        ...(form === undefined ? {} : { inputs: form }),
        ...(outputs.length === 0 ? {} : { outputs }),
        log: _completedLog(),
        onRerun: run.runFromDraft,
      }
    }

    const schema = inputs.schema()
    if (schema === undefined) return undefined
    const presentation = inputs.presentation()
    const issues = inputs.issues()
    const lastRun = _lastRun()
    return {
      kind: 'idle',
      entryNodeId,
      note: IDLE_NOTE,
      descriptor: startNode.input,
      input: schema,
      draft: inputs.inputDraft(),
      ...(presentation === undefined ? {} : { presentation }),
      onDraftChange: inputs.setInputField,
      onRun: (values: Record<string, unknown>) => {
        void run.start(values)
      },
      // F02: the panel's own button is the fifth affordance, and the only one that validates
      // inside `run/`. It reports onto the same state the other four write.
      onInvalid: inputs.reportInvalid,
      ...(issues === undefined ? {} : { issues }),
      // The same predicate the docked control and the top-bar pill read, not a second one: two
      // places deciding whether this is runnable would drift.
      blocked: blocked(),
      ...(lastRun === undefined ? {} : { lastRun }),
    }
  }, `${name}.state`)

  /**
   * Closeout finding 8-A: the run number reached no run state at all. `Studio — run in progress`
   * puts it where the idle chevron was; the standalone settled cards add the elapsed after it, the
   * failed one in its own tone. `RunDock` owns the treatment and stays the dock's ONE header.
   *
   * Derived from `_kind` and the two numbers, **not** from `state`: a running header reads `#219`
   * for the whole run, and hanging it off `state` would rebuild it ten times a second to publish
   * that same string again.
   */
  const meta = computed(
    (): { readonly text: string; readonly tone: RunDockMetaTone } | undefined => {
      const kind = _kind()
      if (kind === undefined || kind === 'idle') return undefined
      if (kind === 'running') return { text: formatRunMeta(_runNumber()), tone: 'normal' }
      return {
        text: formatRunMeta(_runNumber(), _settledElapsed()),
        // R7: the failed meta tone is an error colour, and a cancelled run is not an error.
        tone: kind === 'failed' && !_cancelled() ? 'failed' : 'normal',
      }
    },
    `${name}.meta`,
  )

  /**
   * `2A`: once a run exists, the dock header's left half is the run's state — `● Completed` in the
   * artboard — rather than `Run <entry>`. Idle has no run and no state, so it is `undefined` there
   * and only there.
   *
   * ## F-C4 is resolved, against the earlier ruling recorded here
   *
   * This used to return `undefined` while a run streamed, on the reading that
   * `Studio — run in progress` (design 1818-1822, `Run start1` + `#219`) and `Run panel — states`
   * (2009-2011, ring + `Running` + `#219`) were same-generation artboards in an unbreakable tie.
   * They are not in a tie. `2A:1191` draws the *settled* dock inside the live shell as a state word
   * plus meta, no artboard anywhere draws a settled dock as `Run <entry>`, and `2A` is the newer
   * file — so the header takes a state word. Leaving the running arm out therefore did not pick one
   * artboard over the other: it made the header **change shape mid-run**, `Run start1` up to the
   * last event and `Completed` after it, which is a third behaviour neither artboard draws.
   *
   * So the three artboards describe one header in four states, and this names all of them.
   * `RunDock` owns the treatment; `RunStateHeader` already drew the standalone running card and is
   * where its ring and word came from.
   */
  const dockStatus = computed<RunDockStatus | undefined>(() => {
    const kind = _kind()
    if (kind === 'running') return 'running'
    if (kind === 'completed') return 'completed'
    // R7 — the docked header is the surface the acceptance pass measured saying `Run failed` over
    // a `RunCancelledError`. `RunDock` owns the word and the tone; this says which of the three.
    if (kind === 'failed') return _cancelled() ? 'cancelled' : 'failed'
    return undefined
  }, `${name}.dockStatus`)

  /**
   * `3C` Modal C's open flag. `undefined`-ing the detail underneath it is what closes the dialog
   * for free — a new run, another start or a flow switch all move `_kind` off `failed`, and
   * {@link trace} answers `undefined` from that alone.
   */
  const traceOpen = atom(false, `${name}.traceOpen`)

  /** The settled half of `3A`'s copy sequence, which is the only half `3C` draws. */
  const traceCopied = atom(false, `${name}.traceCopied`)

  /**
   * The dialog's own text, and what both `Copy` and `Save trace` write. Frames verbatim, the error
   * verbatim, the context line the header already prints — nothing here is composed for the file
   * that was not already on screen.
   */
  const _traceText = computed<string | undefined>(() => {
    const detail = failedDetail()
    if (detail === undefined) return undefined
    return toTraceText(detail, traceContext(detail.error.nodeId, _runNumber(), _settledElapsed()))
  }, `${name}._traceText`)

  /**
   * `3C` Modal C, assembled from what the wire actually carries — and **only** from that.
   *
   * The context line, the error class, its sentence, the frames `toRunStack` unpacked and the count
   * of the ones it trimmed are all real. **Two of the artboard's three meta rows are not, and they
   * are left out rather than filled:**
   *
   *  * the `input` row (`markdown · 1.4 kb`) — no wire field names a failed node's input, and none
   *    carries a byte size;
   *  * the `runtime` row (`0.9.2 · node 20.11`) — neither version is on any payload.
   *
   * The `node` row survives because both halves are in the document: the id the error names, and
   * that node's `kind`. The artboard's own second half is the node definition's identity, which the
   * descriptor does not carry — `title` is a human sentence, not `imageOut` — so `kind` is what is
   * true here.
   *
   * `hiddenFrames` arrives as `formatHiddenFrames`' string rather than as a number, and that is the
   * other honesty call: `server/stackFrames.ts` really does count the frames it trimmed and
   * `runWire.ts` really does send the count, so the line is true — but the frames themselves never
   * leave the server, so `3C`'s `↳ show 6 hidden frames` link could reveal nothing. The design's own
   * static wording for the same fact, `Run panel — states`' `↳ 6 frames hidden`, is what is drawn.
   */
  const trace = computed<StackTraceView | undefined>(() => {
    if (!traceOpen()) return undefined
    const detail = failedDetail()
    if (detail === undefined) return undefined
    const nodeId = detail.error.nodeId
    const hidden = formatHiddenFrames(detail.stack?.hiddenFrames ?? 0)
    return {
      context: traceContext(nodeId, _runNumber(), _settledElapsed()),
      errorClass: detail.error.name,
      errorMessage: toProse(detail.error.message, nodeId === '' ? undefined : nodeId),
      frames: detail.stack?.frames ?? NO_FRAMES,
      ...(hidden === undefined ? {} : { hiddenFrames: hidden }),
      meta: traceMeta(descriptor(), nodeId),
      copied: traceCopied(),
    }
  }, `${name}.trace`)

  /**
   * `3A` §4.1's copy script, minus the two cells `3C` does not draw: the artboard has a `Copied`
   * chip and an idle icon ghost and nothing between them, so a failure returns to idle rather than
   * inventing a `Copy failed — retry` this dialog has no room for. RTM-A05: the hold is
   * `await wrap(sleep(…))` under `withAbort()`, so closing the dialog cancels it without a handle.
   */
  const _copyTrace = action(async (text: string) => {
    let failed = false
    try {
      const write = globalThis.navigator?.clipboard?.writeText(text)
      if (write === undefined) failed = true
      else await wrap(write)
    } catch {
      failed = true
    }
    if (failed) return
    traceCopied.set(true)
    await wrap(sleep(ACTION_TIMINGS.copiedHoldMs))
    traceCopied.set(false)
  }, `${name}._copyTrace`).extend(withAbort())

  /** The header control. Refused while `Copied` still stands, exactly as the dock's `Copy all` is. */
  const copyTrace = action(() => {
    if (traceCopied()) return
    const text = _traceText()
    if (text === undefined) return
    detached(_copyTrace(text))
  }, `${name}.copyTrace`)

  /**
   * The footer ghost. It is the same anchor-click write `model/output.ts` performs for the dock's
   * `Download`, on the same text `Copy` puts on the clipboard, so the two cannot disagree.
   *
   * No `3A` cell is drawn for it: `3C` gives this button no loader and no `Saved` confirmation, and
   * a blob write settles inside one tick anyway.
   */
  const saveTrace = action(() => {
    const text = _traceText()
    const detail = failedDetail()
    if (text === undefined || detail === undefined) return
    writeTrace(text, traceFileName(detail.error.nodeId, _runNumber()))
  }, `${name}.saveTrace`)

  /**
   * The footer's destructive primary. It is the failed card's own `Retry node` — the same
   * `run.retryNode`, on the same target — because the engine has exactly one re-execution and both
   * surfaces must reach it, not two that could drift.
   */
  const retryTraceNode = action(() => {
    const detail = failedDetail()
    if (detail === undefined) return
    run.retryNode({
      nodeId: detail.error.nodeId,
      errorName: detail.error.name,
      message: detail.error.message,
    })
    traceOpen.set(false)
  }, `${name}.retryTraceNode`)

  /** `View trace` on the failed node card. A run with no failure to show opens nothing. */
  const openTrace = action(() => {
    if (failedDetail() === undefined) return
    traceOpen.set(true)
  }, `${name}.openTrace`)

  /** `esc`, the `×` and a backdrop click. The copy hold is cancelled with the dialog it lived in. */
  const closeTrace = action(() => {
    _copyTrace.abort()
    traceCopied.set(false)
    traceOpen.set(false)
  }, `${name}.closeTrace`)

  return {
    state,
    meta,
    dockStatus,
    failedDetail,
    traceOpen,
    trace,
    openTrace,
    closeTrace,
    copyTrace,
    saveTrace,
    retryTraceNode,
  }
}
