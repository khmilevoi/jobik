import type { Computed } from '@reatom/core'
import { action, atom, computed, sleep, withAbort, wrap } from '@reatom/core'
import type { SafeFlowDescriptorPayload } from '#client/index.js'
import type { StackTraceMetaEntry, StackTraceView } from '#modals/index.js'
import { ACTION_TIMINGS } from '#primitives/index.js'
import type {
  RunErrorDetail,
  RunInputForm,
  RunLog,
  RunNodeTiming,
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
import type { InputsModel, RunModel, RunPanelModel, StudioDeps, ValidationModel } from './types.js'

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
 * `_deps` is on the signature and unused: every sub-model factory takes the same three arguments so
 * `reatomStudio` wires them all the same way. This one is a pure projection of the models it is
 * handed and reaches nothing outside them.
 */
export function reatomRunPanel(
  _deps: StudioDeps,
  input: {
    descriptor: Computed<SafeFlowDescriptorPayload | undefined>
    inputs: InputsModel
    run: RunModel
    blocked: ValidationModel['blocked']
  },
  name: string,
): RunPanelModel {
  const { descriptor, inputs, run, blocked } = input

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
   * the run's own `failure`, then the report's error, then a failed node's. Nothing here re-tags or
   * re-humanises what arrived.
   *
   * **It is public because `3C`'s Stack trace dialog is the second reader.** `state`'s failed
   * branch is one; {@link trace} is the other, and both want the same pair rather than two
   * derivations that could disagree about which surface carried the failure.
   */
  const failedDetail = computed<
    { readonly error: RunErrorDetail; readonly stack: RunStack | undefined } | undefined
  >(() => {
    const failed = _failedSession()
    if (failed === undefined) return undefined
    const payload =
      failed.failure ??
      failed.report?.error ??
      [...failed.nodes.values()].find((node) => node.error !== null)?.error ??
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
      // `2A`, the newest artboard, draws the completed panel as: node timings, the inputs still
      // shown and still editable, `Re-run start1 ⌘↵`, then `Log` / `tail`. The run's OUTPUTS are
      // not here — they are in the bottom output dock, which the canvas's `inspect` opens. So
      // `outputs` is deliberately not passed: passing it would draw the older `Run panel — states`
      // section as well and the panel would say everything twice.
      return {
        kind: 'completed',
        runNumber: _runNumber(),
        elapsed: _settledElapsed(),
        nodes: _completedNodes(),
        entryNodeId,
        ...(form === undefined ? {} : { inputs: form }),
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
        tone: kind === 'failed' ? 'failed' : 'normal',
      }
    },
    `${name}.meta`,
  )

  /**
   * `2A`: once a run settles, the dock header's left half is `● Completed` or `● Run failed` rather
   * than `Run <entry>`. `Studio — run in progress` keeps the entry point while the run is in
   * flight, and the idle artboard has no state at all, so this is `undefined` in both.
   *
   * ## The missing third arm is an unsettled artboard disagreement, not an oversight
   *
   * `Run panel — states` (design 2013-2019) draws a running header too: a 9px `jspin` ring, the
   * word `Running`, and `#219` on the right. `RunStateHeader` implements it faithfully and
   * `RunPanelCard` draws it, so the artboard is not unimplemented — but the *dock* never reaches
   * it, because this returns `undefined` while a run is in flight and `RunDock` falls back to
   * `Run <entry>` in a `PanelHeader`.
   *
   * That is what `Studio — run in progress` draws, and the two artboards are the same generation:
   * neither carries a `2A`-style prefix, so the "newer wins" tie-break does not apply and no
   * artboard settles it. It is an operator decision. **Do not add a `running` arm here on your own
   * authority** — it would change what the Studio shows during every run, and the disagreement is
   * recorded rather than resolved on purpose. If the standalone card wins, the arm goes here and
   * `RunDockStatus` grows a `running` member; if the full-page artboard wins, this comment is the
   * answer and the next auditor can stop re-finding it.
   */
  const dockStatus = computed<RunDockStatus | undefined>(() => {
    const kind = _kind()
    if (kind === 'completed') return 'completed'
    if (kind === 'failed') return 'failed'
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
