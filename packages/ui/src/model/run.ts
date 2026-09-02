import type { FlowDocument } from '@jobik/core'
import type { Atom, Computed } from '@reatom/core'
import {
  action,
  atom,
  computed,
  peek,
  sleep,
  withAbort,
  withAsync,
  withComputed,
  withConnectHook,
  wrap,
} from '@reatom/core'
import type { SafeFlowDescriptorPayload, WireErrorPayload } from '#client/index.js'
import type { RunHistoryEntry } from '#shell/index.js'
import { formatElapsed } from '#studio/format.js'
import {
  applyRunEvent,
  createRunSession,
  markCancelFailed,
  markCancelling,
  type NodeRunRecord,
  type RunSession,
} from '#studio/runSession.js'
import { runGraphNodeIds } from './runGraph.js'
import type { InputsModel, RetryState, RunModel, StudioDeps } from './types.js'
import { toFailurePayload } from './types.js'

/**
 * The run: starting it, streaming it, cancelling it, and every run this tab has already made.
 *
 * This is what `useStudioSession`'s run half and `StudioApp`'s run half became: one place, with no
 * React in either. `studio/runSession.ts` is still the reducer — `createRunSession`, `applyRunEvent`,
 * `markCancelling`, `markCancelFailed` are consumed here exactly as they are, from inside actions
 * and `computed` bodies — so every rule those functions state is still stated once.
 *
 * ## The six terminal conditions
 *
 * A run ends in exactly one of six ways, and all six put the panel into a state it can render:
 *
 *  1. `run-settled` — the report lands, the node statuses are overwritten from it, and the run
 *     joins {@link RunModel.archive}.
 *  2. `run-failed` — an error and no report; `session.failure` carries it.
 *  3. The start was rejected by the server — `client.startRun` answered an `Error` rather than a
 *     stream. R25: it *ends* the run as a failure rather than nulling the session.
 *  4. The start failed in transport — the same path, with the transport error's own tag and words.
 *  5. The stream threw mid-iteration — `NdjsonParseError`, the one throw `JobikClient` can produce
 *     (R16). This `while` is the only place that owns it.
 *  6. The stream closed cleanly without a terminal line — R28. `applyRunEvent` deliberately cannot
 *     repair that, so the run is ended here with {@link DROPPED_STREAM_PAYLOAD} rather than left
 *     to vanish with `report` and `failure` both `undefined`.
 *
 * ## The two ordering rules
 *
 * **A stale generation `continue`s, never `break`s.** {@link RunModel.generation} is read once,
 * before the first `await`, and every write below is gated on it still matching. A flow switch
 * (`reset`) bumps it and so does the next start — but the loop keeps pulling from the iterator, so
 * the server settles the run and is never left with a reader that walked away. **The generation
 * gates the surfaces, not the archive**: the fold runs on a local session and files the report
 * under the flow the run was started on either way, which is the whole of `3F`'s
 * `Switch and keep running`.
 *
 * **A late cancel failure is dropped.** 8-B: a cancel that loses the race against the run's own
 * terminal line is answered `404`, and writing that onto `session.failure` would replace a
 * completed run's report — which the panel renders `failure` *in place of* — with `Not found`.
 * `markCancelFailed` holds that invariant, and `run-settled` clears `failure` for the mirror case.
 *
 * ## Where the atoms are
 *
 * `session` is one value because `RunSession` is what every read-only surface projects — the
 * archive keeps whole sessions, and `runPresenter.ts` takes one. The per-node state is *derived*
 * from it by {@link reatomRunNodes}, which is where the re-render fix lives: a `node-status` line
 * rebuilds the session's node map but leaves every untouched `NodeRunRecord` at the same identity,
 * so exactly one node model's atoms change and exactly one card is invalidated. `elapsedMs` is its
 * own unit for the same reason in the other direction: the 100ms tick must not invalidate the run
 * log or any node's timing.
 */

/** How often the running chip's clock advances. Fast enough for a `0.1s` readout. */
const TICK_MS = 100

/**
 * The archive of a flow that has run nothing. One instance, so a flow with no runs answers the same
 * value every time and no reader is invalidated by the absence.
 */
const EMPTY_ARCHIVE: readonly RunSession[] = []

/**
 * R28: the reducer in `runSession.ts` relies on the server's structural guarantee that the
 * stream's last line is always `run-settled` or `run-failed`, and deliberately does not defend
 * against a stream that violates it — a pure reducer cannot repair that. A dropped connection is
 * real, though, and this module is the right place to catch it.
 *
 * This is the only copy: `studio/useStudioSession.ts` carried the same string until that file was
 * deleted, and nothing restates it now.
 */
const DROPPED_STREAM_PAYLOAD: WireErrorPayload = {
  _tag: null,
  message: 'The connection to the server closed before the run produced a result.',
}

/**
 * One node's run state, derived from the session and cached by node id.
 *
 * Every field is a `computed` over `session().nodes.get(nodeId)`, and that is the whole of the
 * atomization: `applyRunEvent` copies the node map on a `node-status` line but leaves every other
 * `NodeRunRecord` at its original identity, so only the node the line named produces a new value
 * and only its subscribers are notified. The alternative — one object replaced per stream event,
 * read by every card — is what made a seven-node canvas repaint on every line.
 */
export interface RunNodeModel {
  readonly nodeId: string
  /** The record as the stream last left it, or `undefined` for a node this run never seeded. */
  readonly record: Computed<NodeRunRecord | undefined>
  readonly status: Computed<NodeRunRecord['status'] | undefined>
  readonly elapsedMs: Computed<number | undefined>
  /** `undefined` rather than `null` for absence, as everything in this package spells it. */
  readonly error: Computed<WireErrorPayload | undefined>
}

/** The node models of one session, and the cache that keeps one instance per node id. */
export interface RunNodesModel {
  /** The models of every node the session holds, in the session's own order. */
  readonly list: Computed<readonly RunNodeModel[]>
  /** One node's model, created on first ask and never rebuilt. */
  readonly get: (nodeId: string) => RunNodeModel
}

/**
 * RTM-S07 — a derived collection is a `computed` over the source **plus** a model cache keyed by
 * id. Without the cache, `list` would call the factory again on every recomputation and hand out a
 * fresh model per stream line: the models would forget everything and every card would re-render,
 * which is the exact failure this module exists to fix.
 *
 * It takes the session atom rather than a whole `RunModel` so that a surface projecting a run other
 * than the live one — `viewedSession`, or an archived run — can build its own set over its own
 * source without this module knowing about it.
 *
 * The parameter is `Computed<…>` rather than `Atom<…>` for exactly that reason, and it is a
 * widening rather than a restriction: `Computed<State>` is `AtomLike<State, []>`, which every
 * `Atom<State>` already satisfies, so {@link reatomRun}'s own `session` still passes. Declared as an
 * `Atom` it did not, because `AtomLike.set` is `unknown` and a `Computed` has no `set` to offer —
 * which put {@link RunModel.viewedSession}, the one source a read-only surface actually has, out of
 * reach of the factory written for it.
 */
export function reatomRunNodes(
  session: Computed<RunSession | undefined>,
  name: string,
): RunNodesModel {
  const models = new Map<string, RunNodeModel>()

  const get = (nodeId: string): RunNodeModel => {
    const cached = models.get(nodeId)
    if (cached !== undefined) return cached
    // RTM-S05: a per-instance unit names itself with `#id`.
    const unit = `${name}.node#${nodeId}`
    const record = computed(() => session()?.nodes.get(nodeId), `${unit}.record`)
    const model: RunNodeModel = {
      nodeId,
      record,
      status: computed(() => record()?.status, `${unit}.status`),
      elapsedMs: computed(() => record()?.elapsedMs, `${unit}.elapsedMs`),
      error: computed(() => record()?.error ?? undefined, `${unit}.error`),
    }
    models.set(nodeId, model)
    return model
  }

  const list = computed<readonly RunNodeModel[]>(() => {
    const current = session()
    if (current === undefined) return []
    return [...current.nodes.keys()].map(get)
  }, `${name}.list`)

  return { list, get }
}

export function reatomRun(
  deps: StudioDeps,
  input: {
    flowId: Atom<string | undefined>
    descriptor: Computed<SafeFlowDescriptorPayload | undefined>
    startId: Atom<string | undefined>
    savedDocument: Computed<FlowDocument | undefined>
    inputValues: InputsModel['values']
    inputIssues: InputsModel['issues']
    blocked: Computed<boolean>
  },
  name: string,
): RunModel {
  const now = deps.now ?? Date.now

  const session = atom<RunSession | undefined>(undefined, `${name}.session`)
  const running = atom(false, `${name}.running`)
  const runToken = atom<string | undefined>(undefined, `${name}.runToken`)
  const startedAt = atom(0, `${name}.startedAt`)
  /**
   * The whole of "a run in flight must not corrupt the flow you switched to". `start` reads it once
   * before its first `await`; `reset` bumps it, and so does the next start.
   */
  const generation = atom(0, `${name}.generation`)
  /**
   * Every flow's settled runs, keyed by the flow they were made under.
   *
   * The archive is a client-side record — nothing on the wire returns an earlier run's report — so
   * it lives exactly as long as the tab, and a reload legitimately empties it. **A flow switch is
   * not a reload.** It used to be treated as one: `reset` cleared the whole archive, so looking at
   * another flow destroyed this one's `Runs` group and returning never brought it back. Keying by
   * flow keeps the reason that clear existed — a row of flow `#1` must never appear under flow
   * `#2`'s name — while costing nothing on the way back.
   *
   * Nothing trims a flow's list, and it grows by one `RunSession` — node map, full log, the whole
   * report — per settled run for the life of the tab. `2A`'s `Run history` mockup
   * (`.design/raw/studio.dc.html:955-968`) draws three rows, but that is the run count the pictured
   * scenario happens to have, not a stated cap: no artboard, and no entry in
   * `.design/reports/DECISIONS.md`, fixes a maximum the sidebar should show. Capping it is
   * therefore an operator decision, considered here and deliberately not made up — not an
   * oversight.
   */
  const archives = atom<ReadonlyMap<string, readonly RunSession[]>>(new Map(), `${name}.archives`)

  /**
   * The active flow's slice of {@link archives}, and the only shape every reader wants.
   *
   * RTM-S02: writable state derived from a source is `withComputed`, not a watcher — moving
   * `flowId` re-derives this on the same frame, so no surface ever paints one flow's rows under
   * another's name, and returning to a flow restores its rows with no restore step to run.
   */
  const archive = atom<readonly RunSession[]>([], `${name}.archive`).extend(
    withComputed(() => {
      const flowId = input.flowId()
      return (flowId === undefined ? undefined : archives().get(flowId)) ?? EMPTY_ARCHIVE
    }),
  )
  const selectedRunId = atom<string | undefined>(undefined, `${name}.selectedRunId`)
  const cancelPrompt = atom(false, `${name}.cancelPrompt`)

  const retry = atom<RetryState | undefined>(undefined, `${name}.retry`)

  /**
   * A run ending, as one named transition (RTM-S04) rather than two sets at four call sites.
   *
   * `3B`'s retry is over with the run that carried it: past that, the node's own settled state is
   * the truth and `3B` has nothing left to say. The hook expressed that as
   * `useEffect(() => { if (!running) setRetry(undefined) }, [running])`, which is a frame late;
   * this is the same rule with no frame in between.
   *
   * It is not `retry.extend(withComputed(...))`, which is what RTM-S02 would otherwise ask for:
   * `AtomState<Atom<T | undefined>>` infers `T`, because `AtomLike`'s `__state?: State` is an
   * optional property and TypeScript strips the `undefined` when inferring through one. The
   * extension therefore cannot be typed for an atom whose absence is `undefined`, which is every
   * optional atom in this package.
   */
  const endRun = action(() => {
    running.set(false)
    retry.set(undefined)
  }, `${name}._endRun`)

  /** The ticker's only writer, and `elapsedMs` below is its only reader. */
  const _tick = atom(0, `${name}._tick`)

  const lastReport = computed(() => session()?.report, `${name}.lastReport`)

  /**
   * RTM-L01/RTM-A05 — the clock is a loop of `await wrap(sleep(TICK_MS))` owned by a connect hook
   * that returns its own cleanup, never a `setInterval` handle kept in a closure. It runs while
   * something is reading the clock and stops when nothing is, and it writes `_tick` only while a
   * run is actually in flight, so an idle Studio produces no state changes at all.
   */
  const elapsedMs = computed(() => {
    if (running()) {
      _tick()
      return now() - startedAt()
    }
    return lastReport()?.elapsedMs ?? 0
  }, `${name}.elapsedMs`).extend(
    withConnectHook(() => {
      let stopped = false
      const tick = async () => {
        try {
          while (!stopped) {
            await wrap(sleep(TICK_MS))
            if (stopped) return
            if (peek(running)) _tick.set(peek(_tick) + 1)
          }
        } catch {
          // `withConnectHook` aborts every `wrap` inside it on disconnect, which rejects the
          // pending `sleep`. That is this loop ending, not a failure to report.
        }
      }
      void tick()
      return () => {
        stopped = true
      }
    }),
  )

  const nodes = reatomRunNodes(session, name)

  /**
   * The node the `Cancel run` dialog names twice — the one still working. `2A`'s stream reports at
   * most one at a time; the first is the honest answer either way.
   */
  const runningNodeId = computed(() => {
    for (const node of nodes.list()) {
      if (node.status() === 'running') return node.nodeId
    }
    return undefined
  }, `${name}.runningNodeId`)

  const history = computed<readonly RunHistoryEntry[]>(
    () =>
      archive().flatMap((entry) => {
        const report = entry.report
        if (report === undefined) return []
        return [
          {
            id: String(report.runNumber),
            label: `#${report.runNumber}`,
            // R7 — the three outcomes stay three. This used to collapse `cancelled` into
            // `failed`, which told a user who had stopped a run themselves that it had broken.
            // `model/toast.ts` reads the same field and prints `Run #4 cancelled`; the row it
            // sits beside must not disagree with it.
            status: report.status,
            ...(report.status === 'ok' ? { elapsed: formatElapsed(report.elapsedMs) } : {}),
          },
        ]
      }),
    `${name}.history`,
  )

  /**
   * The row the sidebar marks. A pick always wins; otherwise the newest run is marked, but only
   * while a session is actually on the surfaces. Returning to a flow restores its rows without
   * restoring what was on screen, so marking one then would claim a run is being shown when the
   * canvas, the panel and the dock are all idle.
   */
  const activeRunId = computed(() => {
    const picked = selectedRunId()
    if (picked !== undefined) return picked
    if (session() === undefined) return undefined
    return history()[0]?.id
  }, `${name}.activeRunId`)

  /**
   * A picked row wins, but only while nothing is in flight. A live run owns the canvas and is the
   * one run with no row of its own, so letting a row take over mid-flight would strand the user
   * with no way back to what is actually happening; `start` drops the selection for the same reason.
   */
  const viewedSession = computed(() => {
    const current = session()
    const picked = selectedRunId()
    if (running() || picked === undefined) return current
    return archive().find((entry) => String(entry.report?.runNumber) === picked) ?? current
  }, `${name}.viewedSession`)

  const viewedReport = computed(() => viewedSession()?.report, `${name}.viewedReport`)

  const settledRunIsCurrent = computed(
    () => selectedRunId() !== undefined || viewedSession()?.startId === input.startId(),
    `${name}.settledRunIsCurrent`,
  )

  /**
   * Every run joins its own flow's archive as it settles, newest first, exactly once per run
   * number. A run that never settled has no report and no number, so it never joins.
   *
   * The flow is the one `start` read before its first `await`, never a fresh read: run numbers are
   * per flow, so filing a run under whatever flow is open when its report lands is how a row ends
   * up under the wrong name.
   */
  const archiveSettled = (flowId: string, settled: RunSession): void => {
    const report = settled.report
    if (report === undefined) return
    const all = peek(archives)
    const current = all.get(flowId) ?? EMPTY_ARCHIVE
    if (current.some((entry) => entry.report?.runNumber === report.runNumber)) return
    const next = new Map(all)
    next.set(flowId, [settled, ...current])
    archives.set(next)
  }

  /**
   * Starts a run with values that already satisfied the schema.
   *
   * `withAsync` is here for `.ready()` (RTM-A02) — `3B` asks it rather than keeping a second
   * `running` flag beside the action. `withAbort` is deliberately **`'manual'`**: the default
   * `'last-in-win'` would abort the previous call's `wrap`ed continuations, and this run's whole
   * contract is that a superseded stream keeps draining so the server settles it. The guard is the
   * `generation` atom below, which stops the writes without stopping the reader.
   */
  const start = action(async (values: Record<string, unknown>) => {
    // RTM-A07: every reactive input is read here, synchronously, before the first `await`. These
    // were a `useCallback`'s dependency list; a read placed after an `await` is not one.
    if (input.blocked()) return
    if (running()) return
    const flowId = input.flowId()
    const descriptor = input.descriptor()
    const startId = input.startId()
    const savedDocument = input.savedDocument()
    if (
      flowId === undefined ||
      descriptor === undefined ||
      startId === undefined ||
      savedDocument === undefined
    ) {
      return
    }

    // A new run takes the surfaces over: the archived run a row had selected is no longer what the
    // canvas shows, whatever `3B` was saying about the last failure is finished with, and the draft
    // that is starting satisfied the schema, so the last press's findings are over.
    selectedRunId.set(undefined)
    retry.set(undefined)
    input.inputIssues.set(undefined)

    const runGeneration = generation() + 1
    generation.set(runGeneration)
    const live = () => peek(generation) === runGeneration

    const runStartedAt = now()
    startedAt.set(runStartedAt)
    runToken.set(undefined)

    // Declaration order, filtered — not the traversal order `runGraphNodeIds` happens to build the
    // set in, which is nothing the panel or the canvas should inherit.
    const runGraph = runGraphNodeIds(savedDocument, startId)
    const started = createRunSession({
      startId,
      nodeIds: descriptor.nodes.map((node) => node.id).filter((id) => runGraph.has(id)),
      startedAt: runStartedAt,
    })
    // The one write in this run that deliberately replaces the session rather than folding into it.
    session.set(started)
    running.set(true)

    const stream = await wrap(deps.client.startRun({ flowId, startId, input: values }))
    if (stream instanceof Error) {
      // Terminal condition 3 and 4. R25: a rejected start no longer nulls the session — it ends it
      // as a failure, the same surface every other path below uses.
      if (!live()) return
      const payload = toFailurePayload(stream)
      const current = peek(session)
      if (current !== undefined) session.set({ ...current, failure: payload })
      endRun()
      return
    }

    // Iterated by hand rather than with `for await` so every continuation crosses `wrap` (RTM-A04):
    // a bare `for await` resumes outside the frame and the writes below would be lost.
    const iterator = stream[Symbol.asyncIterator]()
    /**
     * The fold's own copy of the run, and the reason `3F`'s `Switch and keep running` keeps its
     * promise rather than only appearing to.
     *
     * While this run still owns the surfaces the `session` atom is the accumulator, and it has to
     * be: `cancel` writes `cancelling`, and a failed cancel's payload, straight onto it out of band
     * (R27), and the next event must fold onto *that*. Once a flow switch has taken the surfaces
     * away, `reset` has set the atom to `undefined` and every write below is stopped — so reading
     * the accumulator back from it there would end the fold, and the run would settle into nothing.
     * This variable is what the run is then, and it is what reaches the archive.
     */
    let folded: RunSession = started
    try {
      while (true) {
        const step = await wrap(iterator.next())
        if (step.done === true) break
        const event = step.value
        const base = live() ? peek(session) : folded
        if (base === undefined) continue
        const next = applyRunEvent(base, event)
        folded = next
        // Terminal condition 1: a settled report joins its own flow's archive whether or not this
        // run still owns the surfaces, and `archiveSettled` takes the flow `start` read before its
        // first `await` so the row cannot land under the name of the flow that replaced it. The
        // dedup on `report.runNumber` is what makes calling it on every line free.
        archiveSettled(flowId, next)
        // `continue`, not `break`: the flow changed under this run, so nothing it says may reach
        // the panel any more — but the stream is still drained to completion so the server settles
        // the run rather than being left with a reader that walked away.
        if (!live()) continue
        if (event.type === 'run-accepted') runToken.set(event.runToken)
        session.set(next)
      }
      // Terminal condition 6 (R28): the stream ended without a terminal line. `applyRunEvent` sets
      // neither `report` nor `failure` on its own, so a session that reaches here with neither is a
      // dropped connection, not a settled run.
      if (live()) {
        const current = peek(session)
        if (
          current !== undefined &&
          current.report === undefined &&
          current.failure === undefined
        ) {
          session.set({ ...current, failure: DROPPED_STREAM_PAYLOAD })
        }
      }
    } catch (cause) {
      // Terminal condition 5 (R16): `readNdjsonStream` throws `NdjsonParseError` mid-iteration on a
      // protocol violation and `JobikClient.startRun` deliberately does not catch it — this loop is
      // the one place that owns the failure.
      const error = cause instanceof Error ? cause : new Error(String(cause))
      const payload = toFailurePayload(error)
      if (live()) {
        const current = peek(session)
        if (current !== undefined) session.set({ ...current, failure: payload })
      }
    }

    // Guarded like every write above: `reset` has already put `running` back to `false` for this
    // run, and a run started under the new flow owns the flag now — clearing it from here would
    // unlock a draft the live run is still holding.
    if (live()) endRun()
  }, `${name}.start`).extend(withAsync(), withAbort('manual'))

  /**
   * `⌘↵`, the docked control, the top bar and a failed panel's `Re-run`. R35: one place turns the
   * input draft into run values, so none of the affordances can drift from the others; F02: when it
   * cannot, `inputValues` files the finding and this does nothing.
   */
  const runFromDraft = action(() => {
    const values = input.inputValues()
    if (values === undefined) return
    void start(values)
  }, `${name}.runFromDraft`)

  /**
   * `3B` — what `Retry node` on a failed card does. The engine runs a whole flow from a start;
   * there is no re-execution of a single node, so this starts exactly the run `Re-run` starts and
   * records which card asked, with the failure it is retrying *from*.
   */
  const retryNode = action((target: RetryState) => {
    // A run already in flight is the run; and `3D` blocks every start while an error stands, so a
    // press that cannot start a run must not leave the card claiming one did.
    if (running() || input.blocked()) return
    const values = input.inputValues()
    if (values === undefined) return
    void start(values)
    // After `start`, which clears it — and only if it took: `start` writes `running` before its
    // first `await`, so this is the honest test of whether a run actually began. A start the
    // guards refused must not leave the card claiming one did.
    if (running()) retry.set(target)
  }, `${name}.retryNode`)

  /**
   * The row the sidebar marks. The open output belongs to the run that produced it and does not
   * carry over — `OutputModel` is what closes it, from its own side, exactly as it closes on a
   * start (see `OutputModel`'s doc comment on why the dependency runs that way round).
   */
  const selectRun = action((runId: string) => {
    selectedRunId.set(runId)
  }, `${name}.selectRun`)

  const askToCancel = action(() => {
    cancelPrompt.set(true)
  }, `${name}.askToCancel`)

  const keepRunning = action(() => {
    cancelPrompt.set(false)
  }, `${name}.keepRunning`)

  /**
   * `## Progress and cancellation`: the stream is NOT closed here. The server settles the run with
   * the abort error and keeps already-settled node results, and that terminal line ends the run.
   */
  const cancel = action(async () => {
    const token = peek(runToken)
    if (token === undefined) return
    const live = peek(session)
    if (live !== undefined) session.set(markCancelling(live))

    const result = await wrap(deps.client.cancelRun(token))
    if (!(result instanceof Error)) return
    // R27: a failed cancel request is a real failure while the run is still live, and it reuses the
    // one surface R25 routes every other failure through. 8-B: `markCancelFailed` reads the session
    // as it stands when the answer lands, which is the whole race — a run that settled first keeps
    // its own outcome and this answer is dropped.
    const payload = toFailurePayload(result)
    const current = peek(session)
    if (current !== undefined) session.set(markCancelFailed(current, payload))
  }, `${name}.cancel`).extend(withAsync())

  const confirmCancel = action(() => {
    cancelPrompt.set(false)
    void cancel()
  }, `${name}.confirmCancel`)

  /**
   * One flow switch, from this module's side. The generation bump is what stops the in-flight run
   * painting the flow that replaced it.
   *
   * **The run itself is not orphaned, and that claim now covers the archive as well as the
   * server.** It used to cover only the server: the stream kept draining, so the run settled — and
   * then landed nowhere, because `archiveSettled` sat below `start`'s `live()` guard and the
   * session it read had just been set to `undefined` here. `start` folds the stream into a local
   * `RunSession` and archives unconditionally, so a run the user chose to keep is waiting under
   * `Runs` when they come back to the flow that made it.
   */
  const reset = action(() => {
    generation.set(generation() + 1)
    runToken.set(undefined)
    startedAt.set(0)
    session.set(undefined)
    endRun()
    cancelPrompt.set(false)
    // The archive is deliberately NOT cleared. Every run in it belongs to the flow being left, and
    // a row of flow `#1` under flow `#2`'s name is the frame `switchTo` existed to prevent — but
    // `archives` is keyed by flow, so moving `flowId` is what prevents it now, and the runs the
    // user made survive a look at another flow.
    selectedRunId.set(undefined)
  }, `${name}.reset`)

  return {
    session,
    running,
    runToken,
    startedAt,
    generation,
    elapsedMs,
    lastReport,
    archive,
    selectedRunId,
    history,
    activeRunId,
    viewedSession,
    viewedReport,
    settledRunIsCurrent,
    runningNodeId,
    retry,
    cancelPrompt,
    start,
    runFromDraft,
    retryNode,
    selectRun,
    askToCancel,
    keepRunning,
    confirmCancel,
    cancel,
    reset,
  }
}
