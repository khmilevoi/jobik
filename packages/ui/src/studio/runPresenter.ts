import type { NodeStatus } from '@jobik/core'
import type { NodeRunState } from '#canvas/index.js'
import { RUN_ANNOTATIONS } from '#canvas/index.js'
import type { WireErrorPayload, WireRunReportPayload } from '#client/index.js'
import { wireErrorFrames } from '#client/index.js'
import type {
  RunErrorDetail,
  RunLog,
  RunNodeStatus,
  RunNodeTiming,
  RunStack,
  RunSummary,
} from '#run/index.js'
import { formatElapsed, formatLogTime } from './format.js'
import type { NodeOverlay } from './graphModel.js'
import { completedNodeCount, type RunSession } from './runSession.js'

/**
 * A `RunSession` projected onto the two surfaces the design fixes: the run panel's node list, log,
 * summary and error block, and the node cards' own state.
 *
 * `cached` never occurs in v1 (standing ruling 3) but is carried through rather than thrown on, so
 * a future execution change cannot produce an unrenderable card — or, as this module used to do,
 * a panel row that reports a reused result as a freshly computed one.
 */

const SETTLED_WITH_TIME: ReadonlySet<NodeStatus> = new Set<NodeStatus>(['ok', 'failed', 'cached'])

/**
 * Standing ruling 2 said the panel's `RunNodeStatus` had no `cached`, so this narrowed `cached` to
 * `ok` — the only settled-success word the panel had. Closeout finding 3: that made a future
 * caching feature light up the canvas and stay invisible in the panel, so `RunNodeStatus` now
 * mirrors core's `NodeStatus` exactly and this is the identity. It stays as an annotated assignment
 * rather than an untyped pass-through: if core ever adds a status the panel has no treatment for,
 * this is the line that must fail to compile instead of collapsing it into a neighbour.
 */
function toPanelStatus(status: NodeStatus): RunNodeStatus {
  return status
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
 *
 * F-S3: the header's right-hand label is a statement about the log, so it belongs to the session
 * rather than to whichever panel state happens to draw it. `follow` means the lines are still
 * arriving; `2A`'s settled `Log` block reads `tail`, and a session is settled the moment it has a
 * report or a failure of its own. Nothing streams into a settled session, so `follow` there would
 * promise motion that has already stopped.
 */
export function toRunLog(session: RunSession): RunLog {
  const settled = session.report !== undefined || session.failure !== undefined
  return {
    lines: session.logs.map((line) => ({
      time: formatLogTime(line.at - session.startedAt),
      text: `${line.nodeId} ${line.message}`,
    })),
    followLabel: settled ? 'tail' : 'follow',
  }
}

/** Written out in full, so a fourth wire outcome is a type error rather than a silent `failed`. */
const runSummaryStatus = {
  ok: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
} satisfies Record<WireRunReportPayload['status'], RunSummary['status']>

/**
 * `### Run panel` idle state: the `Last run` block.
 *
 * All three of the engine's outcomes come through as themselves (R7). This block prints the status
 * as a word, so the tone argument that once justified folding `cancelled` into `failed` does not
 * reach it: whatever the dot does, the label would have read `failed` over a run the user stopped
 * on purpose — the one thing the dock header, the history row and the toast were all fixed not to
 * say. `ok` becomes `completed` because that is the word `Studio — default` draws.
 */
export function toRunSummary(report: WireRunReportPayload): RunSummary {
  return {
    status: runSummaryStatus[report.status],
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
