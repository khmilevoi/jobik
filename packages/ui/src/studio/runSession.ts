import type { NodeStatus, RunLogLine } from '@jobik/core'
import type { RunStreamEvent, WireErrorPayload, WireRunReportPayload } from '../client/index.js'

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
  /** Set only by `run-failed`, which carries an error and no report. */
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
      }
    }

    case 'run-failed':
      return { ...session, failure: event.error }
  }
}

export function markCancelling(session: RunSession): RunSession {
  return { ...session, cancelling: true }
}

export function completedNodeCount(session: RunSession): number {
  let completed = 0
  for (const record of session.nodes.values()) {
    if (SETTLED.has(record.status)) completed += 1
  }
  return completed
}
