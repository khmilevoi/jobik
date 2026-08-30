import * as jobik from '@jobik/core'

/**
 * The tagged-error wire serialiser: the second half of the wall between the server and the browser.
 *
 * Three rules, all enforced by construction rather than by review:
 *
 * 1. **Never `toJSON()`.** `errore`'s inherited `toJSON()` emits `cause` and `stack` and omits every
 *    declared field — exactly backwards for a browser. `packages/core/src/errors.ts` says so in its
 *    own header. This module builds an explicit projection per `_tag` instead.
 * 2. **Never `error.message`.** Six taxonomy messages interpolate `$path`, and a path binding is
 *    always absolute. Every message below is written here, from safe declared fields only.
 * 3. **Never an unknown tag.** `toWireError` switches exhaustively over `jobik.JobikError`; the
 *    compiler rejects an unhandled member, and `isJobikError` allowlists against
 *    `jobik.jobikErrorTags` before anything is projected at all.
 *
 * `errore` types a `$variable` message placeholder as `string | number` on the instance, so those
 * are coerced with `String(...)`. Class fields already have exact types.
 */

const JOBIK_ERROR_TAGS: ReadonlySet<string> = new Set<string>(jobik.jobikErrorTags)

/** Every failing response for a tagged Jobik error. Discriminated on `_tag`. */
export type WireError =
  | { readonly _tag: 'FlowFileReadError'; readonly message: string }
  | {
      readonly _tag: 'FlowSchemaError'
      readonly message: string
      readonly issues: readonly jobik.SchemaIssue[]
    }
  | {
      readonly _tag: 'FlowMigrationError'
      readonly message: string
      readonly from: number
      readonly to: number
    }
  | {
      readonly _tag: 'UnsupportedFlowVersionError'
      readonly message: string
      readonly version: number
      readonly supported: number
    }
  | {
      readonly _tag: 'ConnectionError'
      readonly message: string
      readonly from: jobik.FieldRef | null
      readonly to: jobik.FieldRef | null
      readonly cycle: readonly string[]
    }
  | {
      readonly _tag: 'StartNotFoundError'
      readonly message: string
      readonly startId: string
      readonly available: readonly string[]
    }
  | {
      readonly _tag: 'RunInputError'
      readonly message: string
      readonly startId: string
      readonly issues: readonly jobik.SchemaIssue[]
    }
  | {
      readonly _tag: 'NodeExecutionError'
      readonly message: string
      readonly nodeId: string
      readonly runNumber: number
      /**
       * P13 EXTENSION POINT. The base serialiser never sets these. P13 owns the trimmed stack —
       * the first frames inside flow code, with the remainder reported as `hiddenFrames`. A raw
       * `Error.stack` and a `cause` object are still never sent. P13 must relativise `file` against
       * the flow root before populating it, because an absolute `file` would breach the never-on-the-wire
       * rule and `findUnsafeValues` would flag it.
       */
      readonly frames?: readonly jobik.StackFrame[]
      readonly hiddenFrames?: number
    }
  | {
      readonly _tag: 'UpstreamFailedError'
      readonly message: string
      readonly nodeId: string
      readonly upstreamNodeId: string
      readonly runNumber: number
    }
  | { readonly _tag: 'FlowSaveError'; readonly message: string }
  | {
      readonly _tag: 'FlowRevisionConflictError'
      readonly message: string
      readonly expectedRevision: string
      readonly actualRevision: string
    }
  | {
      readonly _tag: 'JobUiSchemaError'
      readonly message: string
      readonly nodeId: string
      readonly field: string
      readonly io: 'input' | 'output'
    }
  | { readonly _tag: 'RunCancelledError'; readonly message: string; readonly runNumber: number }

/**
 * A failure that is not a tagged Jobik error: an unrouted request, a malformed body, a bug. It
 * carries `_tag: null` so the browser can switch on the same key, and one of a CLOSED set of
 * constant messages — nothing about the original value is ever read. This is a deliberate extension
 * of the spec for transport failures outside the frozen error taxonomy, distinguishable on the wire
 * by `_tag === null`.
 */
export type UntaggedWireError = { readonly _tag: null; readonly message: string }

export type WireErrorBody = { readonly error: WireError | UntaggedWireError }

/** The only messages an untagged failure may carry. */
export const WIRE_MESSAGES = {
  internal: 'Internal server error',
  notFound: 'Not found',
  flowNotFound: 'No such flow',
  badBody: 'Malformed request body',
  methodNotAllowed: 'Method not allowed',
} as const

export type UntaggedWireMessage = (typeof WIRE_MESSAGES)[keyof typeof WIRE_MESSAGES]

/** The allowlist gate: a tagged error whose `_tag` the taxonomy declares, and nothing else. */
export function isJobikError(value: unknown): value is jobik.JobikError {
  if (!(value instanceof Error)) return false
  const tag = (value as { _tag?: unknown })._tag
  return typeof tag === 'string' && JOBIK_ERROR_TAGS.has(tag)
}

/** Project one tagged Jobik error onto the wire. Exhaustive over the taxonomy by construction. */
export function toWireError(error: jobik.JobikError): WireError {
  switch (error._tag) {
    case 'FlowFileReadError':
      return { _tag: 'FlowFileReadError', message: 'Cannot read the flow document' }
    case 'FlowSchemaError':
      return {
        _tag: 'FlowSchemaError',
        message: 'The flow document is not a valid jobik.flow document',
        issues: error.issues,
      }
    case 'FlowMigrationError':
      return {
        _tag: 'FlowMigrationError',
        message: `Migrating the flow document from version ${error.from} to version ${error.to} failed`,
        from: error.from,
        to: error.to,
      }
    case 'UnsupportedFlowVersionError':
      return {
        _tag: 'UnsupportedFlowVersionError',
        message: `The flow document declares version ${error.version}; this build reads version ${error.supported}`,
        version: error.version,
        supported: error.supported,
      }
    case 'ConnectionError':
      return {
        _tag: 'ConnectionError',
        message: `The flow graph is invalid: ${String(error.reason)}`,
        from: error.from,
        to: error.to,
        cycle: error.cycle,
      }
    case 'StartNotFoundError':
      return {
        _tag: 'StartNotFoundError',
        message: `This flow declares no start named ${String(error.startId)}`,
        startId: String(error.startId),
        available: error.available,
      }
    case 'RunInputError':
      return {
        _tag: 'RunInputError',
        message: `The run input for start ${String(error.startId)} does not match its schema`,
        startId: String(error.startId),
        issues: error.issues,
      }
    case 'NodeExecutionError':
      return {
        _tag: 'NodeExecutionError',
        message: `Node ${String(error.nodeId)} failed`,
        nodeId: String(error.nodeId),
        runNumber: error.runNumber,
      }
    case 'UpstreamFailedError':
      return {
        _tag: 'UpstreamFailedError',
        message: `Node ${String(error.nodeId)} was skipped because upstream node ${String(error.upstreamNodeId)} failed`,
        nodeId: String(error.nodeId),
        upstreamNodeId: String(error.upstreamNodeId),
        runNumber: error.runNumber,
      }
    case 'FlowSaveError':
      return { _tag: 'FlowSaveError', message: 'Cannot save the flow document' }
    case 'FlowRevisionConflictError':
      return {
        _tag: 'FlowRevisionConflictError',
        message: `The flow document changed on disk: expected revision ${String(error.expectedRevision)} but found ${String(error.actualRevision)}`,
        expectedRevision: String(error.expectedRevision),
        actualRevision: String(error.actualRevision),
      }
    case 'JobUiSchemaError':
      return {
        _tag: 'JobUiSchemaError',
        message: `Cannot derive an editor schema for field ${String(error.field)} of node ${String(error.nodeId)}: ${String(error.reason)}`,
        nodeId: String(error.nodeId),
        field: String(error.field),
        io: error.io,
      }
    case 'RunCancelledError':
      return {
        _tag: 'RunCancelledError',
        message: 'The run was cancelled',
        runNumber: error.runNumber,
      }
  }
}

/** Wrap any value as a response body. Anything untagged becomes a constant, unread. */
export function toWireErrorBody(error: unknown): WireErrorBody {
  if (isJobikError(error)) return { error: toWireError(error) }
  return { error: { _tag: null, message: WIRE_MESSAGES.internal } }
}

export function untaggedWireErrorBody(message: UntaggedWireMessage): WireErrorBody {
  return { error: { _tag: null, message } }
}

/**
 * The HTTP status for a tag. The browser switches on `_tag`, so this is only about being a
 * well-behaved HTTP server.
 *
 * `499` is nginx's client-closed-request: a cancelled run is not a server failure. P13 owns the run
 * routes and may choose its own status there.
 */
const STATUS_BY_TAG: Readonly<Record<jobik.JobikErrorTag, number>> = {
  FlowFileReadError: 500,
  FlowSchemaError: 422,
  FlowMigrationError: 500,
  UnsupportedFlowVersionError: 500,
  ConnectionError: 422,
  StartNotFoundError: 404,
  RunInputError: 422,
  NodeExecutionError: 500,
  UpstreamFailedError: 500,
  FlowSaveError: 500,
  FlowRevisionConflictError: 409,
  JobUiSchemaError: 500,
  RunCancelledError: 499,
}

export function wireErrorStatus(tag: jobik.JobikErrorTag): number {
  return STATUS_BY_TAG[tag]
}
