import type { NodeStatus, RunLogLine } from '@jobik/core'
import type { RunStreamEvent, WireErrorPayload, WireRunReportPayload } from '#client/index.js'

/**
 * The live run stream, reduced to a value.
 *
 * `## Execution` fixes the order: run started, per-node status transitions with elapsed time,
 * free-form log lines attributed to a node, and run settled with the final report. `## Progress and
 * cancellation` says the editor renders the same report shape whether it arrived streamed or at
 * once — which is why `run-settled` overwrites the accumulated node statuses with the report's:
 * the report is the authority and the transitions are only what let the panel move before it lands.
 *
 * `applyRunEvent` relies on the server's structural guarantee (`## Execution`) that the stream's
 * last line is always exactly one `run-settled` or `run-failed`. It does not guard against an event
 * arriving after a terminal one, or a duplicate `run-accepted` — a pure reducer cannot repair a
 * stream that violates that guarantee. If a stream ended without a terminal event, the session it
 * produced stays permanently unsettled (`report` and `failure` both `undefined`).
 */

export type NodeRunRecord = {
  readonly status: NodeStatus
  readonly elapsedMs: number
  readonly error: WireErrorPayload | null
}

export type RunSession = {
  readonly startId: string
  /** From the stream's first line. `POST /api/runs/:token/cancel` takes it. */
  readonly runToken: string | undefined
  /** `### Run identity`: the monotonic per-flow number, shown as `#219`. */
  readonly runNumber: number | undefined
  readonly nodeCount: number
  /** `Date.now()` when the request was sent. Log stamps and the chip's clock are offsets from it. */
  readonly startedAt: number
  readonly nodes: ReadonlyMap<string, NodeRunRecord>
  readonly logs: readonly RunLogLine[]
  readonly report: WireRunReportPayload | undefined
  /**
   * The run's own failure — `run-failed`, which carries an error and no report — or a cancel
   * request that failed while the run was still live (R27). `run-settled` clears it: the run's own
   * outcome outranks the outcome of a control action issued against it.
   */
  readonly failure: WireErrorPayload | undefined
  readonly cancelling: boolean
}

const SETTLED: ReadonlySet<NodeStatus> = new Set<NodeStatus>(['ok', 'failed', 'skipped', 'cached'])

export function createRunSession(args: {
  startId: string
  nodeIds: readonly string[]
  startedAt: number
}): RunSession {
  const nodes = new Map<string, NodeRunRecord>()
  for (const nodeId of args.nodeIds) {
    nodes.set(nodeId, { status: 'queued', elapsedMs: 0, error: null })
  }

  return {
    startId: args.startId,
    runToken: undefined,
    runNumber: undefined,
    nodeCount: args.nodeIds.length,
    startedAt: args.startedAt,
    nodes,
    logs: [],
    report: undefined,
    failure: undefined,
    cancelling: false,
  }
}

export function applyRunEvent(session: RunSession, event: RunStreamEvent): RunSession {
  switch (event.type) {
    case 'run-accepted':
      return { ...session, runToken: event.runToken }

    case 'run-started':
      return { ...session, runNumber: event.runNumber, nodeCount: event.nodeCount }

    case 'node-status': {
      const nodes = new Map(session.nodes)
      nodes.set(event.nodeId, {
        status: event.status,
        elapsedMs: event.elapsedMs,
        error: event.error,
      })
      return { ...session, nodes }
    }

    case 'node-log':
      return { ...session, logs: [...session.logs, event.line] }

    case 'run-settled': {
      const nodes = new Map(session.nodes)
      for (const node of event.report.nodes) {
        nodes.set(node.nodeId, {
          status: node.status,
          elapsedMs: node.elapsedMs,
          error: node.error,
        })
      }
      return {
        ...session,
        nodes,
        logs: event.report.logs,
        report: event.report,
        runNumber: event.report.runNumber,
        // 8-B, the other direction: the only thing that can already be on `failure` here is a
        // cancel *request* that failed while the run was still live (R27) — the two terminal
        // lines are mutually exclusive and nothing else in this reducer writes it. The run has
        // now said what it is, and the run's own outcome outranks the outcome of a control
        // action issued against it. It must be dropped rather than merely outranked: the panel
        // renders `failure` *in place of* the report, so a session carrying both paints a
        // completed run as an error with no outputs.
        failure: undefined,
      }
    }

    case 'run-failed':
      return { ...session, failure: event.error }
  }
}

/**
 * Has the stream produced its terminal line? `## Execution` allows exactly two — `run-settled`
 * and `run-failed` — and each writes one of these two fields, so their presence is the whole
 * definition of settled. (R21 deleted an earlier `isSettled` as unconsumed; the cancel transitions
 * below are its consumer, and they are the only place it is used.)
 */
function isSettled(session: RunSession): boolean {
  return session.report !== undefined || session.failure !== undefined
}

/**
 * The two transitions a cancel can drive, and the one rule they share.
 *
 * Deferred finding 8-B: a cancel that loses the race against the run's own terminal line is
 * answered `404` — the run has already left the server's registry — and routing that answer onto
 * `failure` (R27) replaced a completed run's report with `Error / Not found`, taking its outputs
 * off the panel with it. The invariant both functions below hold is broader than that one status
 * code: **a settled session is never rewritten by the outcome of a control action issued against
 * it.** A run that has produced its report, or its failure, has already said what it is; cancel is
 * a request about that run, not a result of it.
 *
 * That is deliberately not "ignore a failed cancel". While the run is still live there is
 * something to cancel and a failed request means it did not happen, so `markCancelFailed` puts the
 * failure on `failure` exactly as R27 made it — whatever the status, `404` included. Only the late
 * arrival is dropped, because by then the request is moot: there is no run left to cancel and
 * nothing the user could do about it.
 */
export function markCancelling(session: RunSession): RunSession {
  if (isSettled(session)) return session
  return { ...session, cancelling: true }
}

export function markCancelFailed(session: RunSession, error: WireErrorPayload): RunSession {
  if (isSettled(session)) return session
  return { ...session, failure: error }
}

export function completedNodeCount(session: RunSession): number {
  let completed = 0
  for (const record of session.nodes.values()) {
    if (SETTLED.has(record.status)) completed += 1
  }
  return completed
}
