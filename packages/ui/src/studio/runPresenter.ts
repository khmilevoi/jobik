import type { NodeStatus } from '@jobik/core'
import type { NodeRunState } from '../canvas/index.js'
import { RUN_ANNOTATIONS } from '../canvas/index.js'
import type { WireErrorPayload, WireRunReportPayload } from '../client/index.js'
import { wireErrorFrames } from '../client/index.js'
import type {
  RunErrorDetail,
  RunLog,
  RunNodeStatus,
  RunNodeTiming,
  RunStack,
  RunSummary,
} from '../run/index.js'
import { formatElapsed, formatLogTime } from './format.js'
import type { NodeOverlay } from './graphModel.js'
import { completedNodeCount, type RunSession } from './runSession.js'

/**
 * A `RunSession` projected onto the two surfaces the design fixes: the run panel's node list, log,
 * summary and error block, and the node cards' own state.
 *
 * `cached` never occurs in v1 (standing ruling 3) but is mapped rather than thrown on, so a future
 * execution change cannot produce an unrenderable card.
 */

const SETTLED_WITH_TIME: ReadonlySet<NodeStatus> = new Set<NodeStatus>(['ok', 'failed', 'cached'])

/** Standing ruling 2: the panel's `RunNodeStatus` has a `skipped` treatment; `NodeStatus` also has
 *  `cached`, which the panel type does not, so `cached` narrows to `ok` — the only settled-success
 *  word the panel has. Everything else passes through unchanged. */
function toPanelStatus(status: NodeStatus): RunNodeStatus {
  return status === 'cached' ? 'ok' : status
}

export function toRunNodeTimings(
  session: RunSession,
  order: readonly string[],
): readonly RunNodeTiming[] {
  const ids = [...order, ...[...session.nodes.keys()].filter((id) => !order.includes(id))]

  return ids.flatMap((nodeId) => {
    const record = session.nodes.get(nodeId)
    if (record === undefined) return []
    const status = toPanelStatus(record.status)
    return [
      SETTLED_WITH_TIME.has(record.status)
        ? { nodeId, status, elapsed: formatElapsed(record.elapsedMs) }
        : { nodeId, status },
    ]
  })
}

/**
 * `### Run panel` running state: a `Live log` with mono timestamped lines. The core `RunLogLine`
 * carries `{ nodeId, message, at }`; the panel wants `{ time, text }`, and the artboard's lines
 * read `render layout pass complete` — the node id, then the message.
 */
export function toRunLog(session: RunSession): RunLog {
  return {
    lines: session.logs.map((line) => ({
      time: formatLogTime(line.at - session.startedAt),
      text: `${line.nodeId} ${line.message}`,
    })),
    followLabel: 'follow',
  }
}

/** `### Run panel` idle state: the `Last run` block. It has two tones, so `cancelled` is `failed`. */
export function toRunSummary(report: WireRunReportPayload): RunSummary {
  return {
    status: report.status === 'ok' ? 'completed' : 'failed',
    totalElapsed: formatElapsed(report.elapsedMs),
    nodeCount: report.nodes.length,
    timings: report.nodes.map((node) => ({
      nodeId: node.nodeId,
      status: toPanelStatus(node.status),
      elapsed: formatElapsed(node.elapsedMs),
    })),
  }
}

/**
 * The failed panel's error block. Renders what arrived: a tagged error a handler *returned* keeps
 * its own `_tag`; one that was *thrown* collapses to `{ _tag: null, message: 'Internal server
 * error' }` and is shown with the neutral name `Error`. Nothing here re-tags or re-humanises.
 */
export function toRunErrorDetail(session: RunSession): RunErrorDetail {
  for (const [nodeId, record] of session.nodes) {
    if (record.status === 'failed' && record.error !== null) {
      return {
        name: record.error._tag ?? 'Error',
        nodeId,
        message: record.error.message,
      }
    }
  }

  const failure = session.failure ?? session.report?.error
  return {
    name: failure?._tag ?? 'Error',
    nodeId: '',
    message: failure?.message ?? 'The run failed',
  }
}

/** `## Errors`: `frames` only, capped, with the remainder as a hidden count. Never a raw stack. */
export function toRunStack(error: WireErrorPayload): RunStack | undefined {
  const trimmed = wireErrorFrames(error)
  if (trimmed === undefined) return undefined
  return { frames: trimmed.frames, hiddenFrames: trimmed.hiddenFrames }
}

/** `### Node cards`: `received` on bound inputs, `pending` on unsettled outputs, `waiting` on a
 *  queued node's inputs. */
function annotationsFor(status: NodeStatus): {
  readonly inputAnnotation: string
  readonly outputAnnotation?: string
} {
  if (status === 'queued') return { inputAnnotation: RUN_ANNOTATIONS.waiting }
  if (status === 'running') {
    return {
      inputAnnotation: RUN_ANNOTATIONS.received,
      outputAnnotation: RUN_ANNOTATIONS.pending,
    }
  }
  return { inputAnnotation: RUN_ANNOTATIONS.received }
}

function toCardState(status: NodeStatus): NodeRunState {
  // Standing ruling 2: the `Node states` artboard has no `skipped` card, and `queued` is its only
  // "did not run" treatment. The status word (kept alongside, below) keeps the two distinguishable.
  if (status === 'skipped') return 'queued'
  return status
}

export function toNodeOverlays(session: RunSession): ReadonlyMap<string, NodeOverlay> {
  const total = session.nodeCount > 0 ? session.nodeCount : session.nodes.size
  const settled = completedNodeCount(session)
  const overlays = new Map<string, NodeOverlay>()

  for (const [nodeId, record] of session.nodes) {
    const annotations = annotationsFor(record.status)

    overlays.set(nodeId, {
      state: toCardState(record.status),
      status: record.status,
      ...(SETTLED_WITH_TIME.has(record.status) ? { elapsed: formatElapsed(record.elapsedMs) } : {}),
      // `### Node cards`: a running node adds a 2px determinate bar. Nothing in the stream reports
      // per-node progress, so the bar reflects how far the run itself has come.
      ...(record.status === 'running'
        ? { progress: total > 0 ? Math.max(0.05, settled / total) : 0.05 }
        : {}),
      ...annotations,
      ...(record.status === 'failed' && record.error !== null
        ? {
            detail: {
              kind: 'failed' as const,
              errorName: record.error._tag ?? 'Error',
              message: record.error.message,
            },
          }
        : {}),
    })
  }

  return overlays
}
