import type * as jobik from '@jobik/core'
import { trimStackFrames } from './stackFrames.js'
import {
  isJobikError,
  toWireError,
  type UntaggedWireError,
  WIRE_MESSAGES,
  type WireError,
} from './wireError.js'

/**
 * The run as the browser sees it.
 *
 * `## Execution` says the editor renders the same report shape whether it arrived streamed or at
 * once. That holds here: `run-settled` carries exactly the `WireRunReport` a caller would get from
 * a non-streaming projection of the same run.
 *
 * Three things change on the way across, and only these three:
 *
 * 1. A binary output field becomes its `AssetDescriptor`. `### Binary and non-JSON outputs`:
 *    "The in-process report keeps that `Buffer`, so `run()` in application code loses nothing.
 *    Replacing it with an asset descriptor ... is a serialisation step the server applies
 *    explicitly as the report crosses to the browser."
 * 2. An `Error` becomes a `WireError` or the untagged constant — never a `cause`, never a `stack`.
 * 3. Anything else that `JSON.stringify` would throw on or mangle becomes `null`. That is
 *    defence in depth, not a feature: binding already rejects an unrepresentable field with
 *    `JobUiSchemaError`, so a well-formed flow never reaches it.
 */

/**
 * A tagged error a node handler RETURNED as a value. `_tag` and `message` are the author's own.
 *
 * `authored` is the discriminant and is not decoration: `WireError`'s `_tag`s are taxonomy literals
 * and this one's is any string, so `'FlowSaveError'` is assignable to it and no comparison on
 * `_tag` alone can separate the two at the type level.
 */
export type AuthoredWireError = {
  readonly _tag: string
  readonly message: string
  readonly authored: true
}

/** Every shape an error attached to a node, an event or a run can take on the wire. */
export type NodeWireError = WireError | AuthoredWireError | UntaggedWireError

/** Whether a projection came from the frozen taxonomy rather than from a handler's own error. */
export function isTaxonomyWireError(error: NodeWireError): error is WireError {
  return error._tag !== null && !('authored' in error)
}

/** One node's report, browser-safe. Field-for-field `jobik.NodeReport` with `output` and `error` projected. */
export type WireNodeReport = {
  readonly nodeId: string
  readonly status: jobik.NodeStatus
  readonly elapsedMs: number
  readonly output: Readonly<Record<string, unknown>> | null
  readonly assets: Readonly<Record<string, jobik.AssetDescriptor>>
  readonly error: NodeWireError | null
}

/** The whole run, browser-safe. */
export type WireRunReport = {
  readonly flowName: string
  readonly startId: string
  readonly runNumber: number
  readonly status: jobik.RunStatus
  readonly elapsedMs: number
  readonly nodes: readonly WireNodeReport[]
  readonly logs: readonly jobik.RunLogLine[]
  readonly error: NodeWireError | null
}

/**
 * One line of the NDJSON stream.
 *
 * `run-accepted` and `run-failed` are transport events with no counterpart in `jobik.RunEvent`.
 * `run-accepted` is always first and hands the client its cancellation token before any node runs.
 * `run-failed` is the wire form of `run()` returning a `RunStartError` — a run that never started,
 * and therefore never emitted `run-started` or `run-settled`.
 */
export type RunWireEvent =
  | { readonly type: 'run-accepted'; readonly runToken: string }
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
      readonly status: jobik.NodeStatus
      readonly elapsedMs: number
      readonly error: NodeWireError | null
    }
  | { readonly type: 'node-log'; readonly line: jobik.RunLogLine }
  | { readonly type: 'run-settled'; readonly report: WireRunReport }
  // A `RunStartError` is always a taxonomy member, so this one never carries an authored error;
  // the union is widened only so a consumer switches on one error type across the whole stream.
  | { readonly type: 'run-failed'; readonly error: NodeWireError }

const UNTAGGED: UntaggedWireError = { _tag: null, message: WIRE_MESSAGES.internal }

/**
 * Project one error attached to a node, an event or a run.
 *
 * THE RETURNED/THROWN SPLIT. `packages/core/src/run/execute.ts` puts exactly four kinds of value on
 * `NodeReport.error`, and the engine constructs three of them itself: `RunCancelledError`
 * (lines 150, 229, 280), `UpstreamFailedError` (line 164) and `NodeExecutionError` (lines 184, 254,
 * and line 212 via the handler boundary's `.catch`). The fourth, line 241, is `settledValue` — the
 * value the handler's promise RESOLVED with, which is to say the error it RETURNED. A handler that
 * THREW never reaches line 241; the boundary wrapped it first, and it wraps a thrown non-`Error`
 * too.
 *
 * So `isJobikError` is not merely an allowlist here — it IS the discriminator. Every engine-built
 * error is in the frozen taxonomy, and an error carrying a `_tag` the taxonomy does not declare can
 * only have arrived by being returned. Nothing new is needed from P9 to tell the two apart.
 *
 * - **Returned** is an expected failure the author wrote for the person reading the run panel. It
 *   crosses with its own `_tag` and its own `message` — the case the design's failed artboard
 *   shows. That message is author-authored prose and the author owns its contents: Jobik forwards
 *   it verbatim and does not inspect, redact or truncate it.
 * - **Thrown** is unexpected. It arrives already wrapped as a `NodeExecutionError` and goes through
 *   P10's projection — a message Jobik wrote, plus the trimmed stack `## Errors` allows. The
 *   author's own tag and message are dropped. Nothing about a `_tag` on a thrown error would have
 *   made its message safe: a throw can carry an absolute path, a driver's internals, a secret.
 *
 * P10's taxonomy allowlist is not reverted and stays the rule for everything that is not a
 * handler's returned error, including every error the server itself produces. This is one narrower
 * path alongside it.
 */
export function toNodeWireError(args: { error: Error; flowRoot: string }): NodeWireError {
  if (isJobikError(args.error)) {
    const wire = toWireError(args.error)
    if (wire._tag !== 'NodeExecutionError') return wire
    const { frames, hiddenFrames } = trimStackFrames({ error: args.error, flowRoot: args.flowRoot })
    return { ...wire, frames, hiddenFrames }
  }
  // Reached only by a handler's returned error. An untagged one carries no name the panel could
  // show and no promise that its prose was written for a reader, so it takes the constant.
  const tag: unknown = (args.error as { _tag?: unknown })._tag
  if (typeof tag !== 'string') return UNTAGGED
  return { _tag: tag, message: args.error.message, authored: true }
}

/**
 * Everything `JSON.stringify` cannot carry honestly, made honest.
 *
 * `Uint8Array` matters most: `JSON.stringify` turns it into `{"0":1,"1":2,...}`, which would
 * inline the very bytes `### Binary and non-JSON outputs` says are "never inlined into the wire
 * report". `bigint` matters second: `JSON.stringify` throws on it, which would take a whole
 * response down.
 */
function jsonSafe(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value instanceof Uint8Array) return null
  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
    return null
  }
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Date) return value.toISOString()
  // A cycle re-enters the same object through its own recursion. `Object.entries` has no notion
  // of that, so left alone it recurses until the call stack itself gives up — inside `onEvent`,
  // which the engine's `emit` swallows, and the wire stream never gets its terminal line. `null`
  // is the same "unrepresentable" fallback every other unsafe-for-JSON shape here already gets.
  // `seen` tracks only the current path, not every object visited overall: a shared (non-cyclic)
  // reference reachable from two branches must serialise on both, the way `JSON.stringify` would
  // duplicate it. The recursion below is entirely synchronous, so `finally` removing `value` on
  // the way back out is exact — it is gone from `seen` by the time a sibling branch looks it up.
  if (seen.has(value)) return null
  seen.add(value)
  try {
    if (Array.isArray(value)) return value.map((entry) => jsonSafe(entry, seen))
    if (value instanceof Map || value instanceof Set) return null
    const result: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) result[key] = jsonSafe(entry, seen)
    return result
  } finally {
    seen.delete(value)
  }
}

/**
 * Swap each declared asset field for its descriptor; sanitise everything else.
 *
 * `assets` comes from P9's `collectAssets`, which registers one descriptor per top-level
 * asset-declared field that produced bytes. A binary value with no descriptor — nested, or a field
 * the schema never declared as an asset — is not smuggled through: it becomes `null`.
 */
export function serialiseNodeOutput(args: {
  output: Readonly<Record<string, unknown>> | null
  assets: Readonly<Record<string, jobik.AssetDescriptor>>
}): Readonly<Record<string, unknown>> | null {
  if (args.output === null) return null
  const result: Record<string, unknown> = {}
  for (const [field, value] of Object.entries(args.output)) {
    const descriptor = args.assets[field]
    result[field] = descriptor === undefined ? jsonSafe(value) : descriptor
  }
  return result
}

function serialiseNodeReport(args: { node: jobik.NodeReport; flowRoot: string }): WireNodeReport {
  return {
    nodeId: args.node.nodeId,
    status: args.node.status,
    elapsedMs: args.node.elapsedMs,
    output: serialiseNodeOutput({ output: args.node.output, assets: args.node.assets }),
    assets: args.node.assets,
    error:
      args.node.error === null
        ? null
        : toNodeWireError({ error: args.node.error, flowRoot: args.flowRoot }),
  }
}

/** The whole report, ready for `JSON.stringify`. */
export function serialiseRunReport(args: {
  report: jobik.RunReport
  flowRoot: string
}): WireRunReport {
  return {
    flowName: args.report.flowName,
    startId: args.report.startId,
    runNumber: args.report.runNumber,
    status: args.report.status,
    elapsedMs: args.report.elapsedMs,
    nodes: args.report.nodes.map((node) => serialiseNodeReport({ node, flowRoot: args.flowRoot })),
    logs: args.report.logs,
    error:
      args.report.error === null
        ? null
        : toNodeWireError({ error: args.report.error, flowRoot: args.flowRoot }),
  }
}

/** One of P9's progress events, mapped onto its wire line. */
export function toRunWireEvent(args: { event: jobik.RunEvent; flowRoot: string }): RunWireEvent {
  const { event, flowRoot } = args
  switch (event.type) {
    case 'run-started':
      return {
        type: 'run-started',
        runNumber: event.runNumber,
        flowName: event.flowName,
        startId: event.startId,
        nodeCount: event.nodeCount,
      }
    case 'node-status':
      return {
        type: 'node-status',
        nodeId: event.nodeId,
        status: event.status,
        elapsedMs: event.elapsedMs,
        error: event.error === null ? null : toNodeWireError({ error: event.error, flowRoot }),
      }
    case 'node-log':
      return { type: 'node-log', line: event.line }
    case 'run-settled':
      return { type: 'run-settled', report: serialiseRunReport({ report: event.report, flowRoot }) }
  }
}

/** The wire form of a failure that stopped the run before it started. */
export function toRunStartWireError(error: unknown): WireError | UntaggedWireError {
  return isJobikError(error) ? toWireError(error) : UNTAGGED
}
