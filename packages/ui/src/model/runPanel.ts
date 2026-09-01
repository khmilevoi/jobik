import type { Computed } from '@reatom/core'
import { computed } from '@reatom/core'
import type { SafeFlowDescriptorPayload } from '#client/index.js'
import type {
  RunErrorDetail,
  RunInputForm,
  RunLog,
  RunNodeTiming,
  RunPanelState,
  RunStack,
  RunSummary,
} from '#run/index.js'
import { formatRunMeta } from '#run/index.js'
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
   */
  const _failedDetail = computed<
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
  }, `${name}._failedDetail`)

  const _completedNodes = computed<readonly RunNodeTiming[]>(() => {
    const session = _completedSession()
    return session === undefined ? NO_TIMINGS : toRunNodeTimings(session, _order())
  }, `${name}._completedNodes`)

  /** `2A`'s `Log` / `tail` block, which is the running `Live log` with the other follow label. */
  const _completedLog = computed<RunLog>(() => {
    const session = _completedSession()
    return session === undefined ? NO_TAIL : { ...toRunLog(session), followLabel: 'tail' }
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
      const detail = _failedDetail()
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

  return { state, meta, dockStatus }
}
