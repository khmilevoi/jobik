import type {
  AssetDescriptor,
  FlowDocument,
  NodeInputDescriptor,
  NodeKind,
  NodeOutputDescriptor,
  NodeStatus,
  RunLogLine,
  StackFrame,
} from '@jobik/core'

/**
 * The browser's view of the `@jobik/ui/server` wire.
 *
 * Declared here rather than imported: `packages/ui/src/server` is a Node entry, and neither the
 * Studio bundle nor the `.` entry's generated declarations may reference it. `wire.test.ts` asserts
 * at type level that server types are assignable to their mirrors here, so drift fails typecheck:
 * `FlowListItem` ← `SafeFlowSummary`, `SafeNodeDescriptorPayload` ← `SafeNodeDescriptor`,
 * `SafeFlowDescriptorPayload` ← `SafeFlowDescriptor`, `LoadedFlowPayload` ← `LoadedFlow`,
 * `SavePayload` ← `SavedFlow`, `RevisionConflictPayload` ← wire form of `FlowRevisionConflictError`.
 * `ValidatePayload` has no named server counterpart; the wire form removes the document field
 * from `DraftValidation` and serializes the error.
 */

/**
 * Any error body the server can send. `_tag` is `null` for anything the server would not name —
 * including a tagged error a handler *threw*, which collapses to `Internal server error` on the
 * wire. A tagged error a handler *returned* keeps its own `_tag` and carries `authored: true`.
 *
 * The open index signature is deliberate. The taxonomy's per-tag fields disagree in type across
 * tags (`from` is a `FieldRef | null` on a `ConnectionError` and a `number` on a
 * `FlowMigrationError`), so the browser reads them through the guards below rather than by
 * re-declaring thirteen shapes it would have to keep in step.
 */
export type WireErrorPayload = {
  readonly _tag: string | null
  readonly message: string
  readonly [key: string]: unknown
}

export type FlowListItem = {
  readonly id: string
  readonly name: string
  readonly nodeCount: number
}

export type SafeNodeDescriptorPayload = {
  readonly id: string
  readonly kind: NodeKind
  readonly title: string
  readonly input: NodeInputDescriptor
  readonly output: NodeOutputDescriptor
}

export type SafeFlowDescriptorPayload = {
  readonly id: string
  readonly name: string
  /** The document's file name only, e.g. `flow.jobik.json`. Never its directory. */
  readonly documentFile: string
  /** The file the flow is authored in, e.g. `flow.ts` — the top bar's badge. Basename only. */
  readonly sourceFile: string
  readonly nodes: readonly SafeNodeDescriptorPayload[]
  readonly startIds: readonly string[]
}

export type LoadedFlowPayload = {
  readonly descriptor: SafeFlowDescriptorPayload
  readonly document: FlowDocument
  readonly revision: string
}

export type ValidatePayload =
  | { readonly valid: true }
  | { readonly valid: false; readonly error: WireErrorPayload }

export type SavePayload = { readonly revision: string }

export type WireNodeReportPayload = {
  readonly nodeId: string
  readonly status: NodeStatus
  readonly elapsedMs: number
  readonly output: Readonly<Record<string, unknown>> | null
  /** Keyed by output field name. The bytes live behind `GET /api/assets/:assetId`. */
  readonly assets: Readonly<Record<string, AssetDescriptor>>
  readonly error: WireErrorPayload | null
}

export type WireRunReportPayload = {
  readonly flowName: string
  readonly startId: string
  readonly runNumber: number
  readonly status: 'ok' | 'failed' | 'cancelled'
  readonly elapsedMs: number
  readonly nodes: readonly WireNodeReportPayload[]
  readonly logs: readonly RunLogLine[]
  readonly error: WireErrorPayload | null
}

/** One NDJSON line. The first is always `run-accepted`; the last always settles the run. */
export type RunStreamEvent =
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
      readonly status: NodeStatus
      readonly elapsedMs: number
      readonly error: WireErrorPayload | null
    }
  | { readonly type: 'node-log'; readonly line: RunLogLine }
  | { readonly type: 'run-settled'; readonly report: WireRunReportPayload }
  | { readonly type: 'run-failed'; readonly error: WireErrorPayload }

export type RevisionConflictPayload = WireErrorPayload & {
  readonly _tag: 'FlowRevisionConflictError'
  readonly expectedRevision: string
  readonly actualRevision: string
}

export function isRevisionConflictPayload(
  error: WireErrorPayload,
): error is RevisionConflictPayload {
  return (
    error._tag === 'FlowRevisionConflictError' &&
    typeof error.expectedRevision === 'string' &&
    typeof error.actualRevision === 'string'
  )
}

/**
 * `## Errors`: the server may attach a trimmed `frames` array to a `NodeExecutionError`, capped,
 * with the remainder as a hidden count. Raw `stack` strings and `cause` objects never arrive.
 */
export function wireErrorFrames(
  error: WireErrorPayload,
): { readonly frames: readonly StackFrame[]; readonly hiddenFrames: number } | undefined {
  if (!Array.isArray(error.frames)) return undefined
  const hiddenFrames = typeof error.hiddenFrames === 'number' ? error.hiddenFrames : 0
  return { frames: error.frames as readonly StackFrame[], hiddenFrames }
}
