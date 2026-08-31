import type { AssetDescriptor } from '#asset.js'
import type {
  ConnectionError,
  FlowFileReadError,
  FlowMigrationError,
  FlowSchemaError,
  RunCancelledError,
  RunInputError,
  StartNotFoundError,
  UnsupportedFlowVersionError,
} from '#errors.js'

/**
 * What a run produces: the closed per-node status vocabulary, the structured report, and the
 * progress stream. Pure types and one constant — no behaviour lives here.
 */

/**
 * The spec's closed per-node status set, in vocabulary order. `cached` has a finished visual
 * treatment in the design and no execution behind it in v1: nothing in this package ever produces
 * it, and nothing here implements caching.
 */
export const nodeStatuses = ['queued', 'running', 'ok', 'failed', 'skipped', 'cached'] as const

export type NodeStatus = (typeof nodeStatuses)[number]

/** One free-form log line a handler emitted, attributed to its node. `at` is `Date.now()`. */
export type RunLogLine = {
  readonly nodeId: string
  readonly message: string
  readonly at: number
}

/** What one node did. Every reachable node has exactly one entry, in run order. */
export type NodeReport = {
  readonly nodeId: string
  readonly status: NodeStatus
  /** Handler wall time in milliseconds. `0` for the start and for a node that was never invoked. */
  readonly elapsedMs: number
  /**
   * The validated output, `null` unless the status is `ok`. Asset fields hold the real `Buffer`:
   * swapping it for its descriptor is the server's serialisation step, not this package's.
   */
  readonly output: Readonly<Record<string, unknown>> | null
  /** One descriptor per top-level asset-declared output field with bytes; empty otherwise. */
  readonly assets: Readonly<Record<string, AssetDescriptor>>
  /** `null` when the status is `ok`. */
  readonly error: Error | null
}

/**
 * How the run as a whole settled. Derived from the node reports and the abort signal; it is
 * deliberately NOT a member of the node vocabulary, which describes nodes only.
 */
export type RunStatus = 'ok' | 'failed' | 'cancelled'

export type RunReport = {
  readonly flowName: string
  readonly startId: string
  readonly runNumber: number
  readonly status: RunStatus
  /** Wall time for the whole run, in milliseconds. */
  readonly elapsedMs: number
  /** One entry per reachable node, in the order the run walked them. */
  readonly nodes: readonly NodeReport[]
  /** Every log line the run emitted, interleaved across nodes in emission order. */
  readonly logs: readonly RunLogLine[]
  /** The abort error a cancelled run settled with; `null` for every other run. */
  readonly error: RunCancelledError | null
}

/**
 * The progress stream. A run emits, in order: `run-started`, one `node-status` per node entering
 * `queued`, then per-node transitions and log lines as it goes, and finally `run-settled` carrying
 * the very same report object the awaited call returns.
 */
export type RunEvent =
  | {
      readonly type: 'run-started'
      readonly runNumber: number
      readonly flowName: string
      readonly startId: string
      readonly nodeCount: number
    }
  | {
      readonly type: 'node-status'
      readonly nodeId: string
      readonly status: NodeStatus
      readonly elapsedMs: number
      readonly error: Error | null
    }
  | { readonly type: 'node-log'; readonly line: RunLogLine }
  | { readonly type: 'run-settled'; readonly report: RunReport }

export type RunOptions = {
  /** Cancels the run. Aborting settles it with `RunCancelledError` and keeps settled results. */
  readonly signal?: AbortSignal
  /**
   * Called synchronously as the run progresses. A throw is contained: the run still settles and
   * produces its report, and the event that triggered the throw is simply lost for this consumer.
   */
  readonly onEvent?: (event: RunEvent) => void
}

/**
 * Everything that stops a run before it starts — an unreadable or invalid document, an unknown
 * start, run input that does not match the start's schema. Returned as a value; once a run has
 * started, failure lives in the report instead.
 */
export type RunStartError =
  | ConnectionError
  | FlowFileReadError
  | FlowMigrationError
  | FlowSchemaError
  | RunInputError
  | StartNotFoundError
  | UnsupportedFlowVersionError
