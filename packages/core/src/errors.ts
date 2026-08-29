import * as errore from 'errore'

/**
 * The complete Jobik error taxonomy.
 *
 * FROZEN after the foundation plan. Every class the spec names is declared here once, with its
 * `_tag`, its typed fields and a `cause` slot. Downstream plans CONSTRUCT these errors and never
 * edit this file. A plan that needs a field this taxonomy does not have reports a spec gap.
 *
 * Field convention: `$variable` message placeholders are typed `string | number` by `errore`, so
 * they are reserved for string identifiers. Every other field is declared on the class and
 * assigned in an explicit constructor, which keeps its type exact.
 *
 * Serialisation policy: never call the `toJSON()` these classes inherit from `errore` to build a
 * response for the wire. It emits `_tag`, `name`, `message`, `messageTemplate`, `fingerprint`,
 * `cause` and `stack`, and it omits every field declared above (`issues`, `frames`,
 * `hiddenFrames`, `runNumber`, `io`, `from`, `to`, `cycle`, `version`, `supported`, `available`)
 * because those are class fields, not message-template variables. That is backwards for the
 * browser: `cause` and `stack` must never reach it, while the declared fields are exactly what it
 * needs. The wire layer must instead build an explicit projection per `_tag`, assembled from
 * `_tag` plus the declared fields it chooses to expose, checked against `jobikErrorTags` as an
 * allowlist. Note also that any message interpolating `$path` embeds an absolute filesystem path,
 * because path bindings are always absolute; those messages are for the Node-side consumer of
 * `run()` and the wire layer must not forward them verbatim. This is written here, rather than as
 * an override, because this file is frozen and `toJSON()` cannot be redefined by a later plan.
 */

/** One frame of a trimmed stack, as sent to the failed-run panel. Never a raw `Error.stack`. */
export type StackFrame = { readonly fn: string; readonly file: string; readonly line: number }

/** One schema validation problem, flattened for the wire. */
export type SchemaIssue = { readonly path: string; readonly message: string }

/** One end of a connection: a field on a node. */
export type FieldRef = { readonly node: string; readonly field: string }

export class FlowFileReadError extends errore.createTaggedError({
  name: 'FlowFileReadError',
  message: 'Cannot read the flow document at $path',
}) {}

export class FlowSchemaError extends errore.createTaggedError({
  name: 'FlowSchemaError',
  message: 'The flow document at $path is not a valid jobik.flow document',
}) {
  readonly issues: readonly SchemaIssue[]

  constructor(args: { path: string; issues?: readonly SchemaIssue[]; cause?: unknown }) {
    super(args)
    this.issues = args.issues ?? []
  }
}

export class FlowMigrationError extends errore.createTaggedError({
  name: 'FlowMigrationError',
  message: 'Migrating the flow document at $path failed',
}) {
  readonly from: number
  readonly to: number

  constructor(args: { path: string; from: number; to: number; cause?: unknown }) {
    super(args)
    this.from = args.from
    this.to = args.to
  }
}

export class UnsupportedFlowVersionError extends errore.createTaggedError({
  name: 'UnsupportedFlowVersionError',
  message: 'The flow document at $path declares a version this build cannot read',
}) {
  readonly version: number
  readonly supported: number

  constructor(args: { path: string; version: number; supported: number; cause?: unknown }) {
    super(args)
    this.version = args.version
    this.supported = args.supported
  }
}

export class ConnectionError extends errore.createTaggedError({
  name: 'ConnectionError',
  message: 'The flow graph is invalid: $reason',
}) {
  readonly from: FieldRef | null
  readonly to: FieldRef | null
  readonly cycle: readonly string[]

  constructor(args: {
    reason: string
    from?: FieldRef | null
    to?: FieldRef | null
    cycle?: readonly string[]
    cause?: unknown
  }) {
    super(args)
    this.from = args.from ?? null
    this.to = args.to ?? null
    this.cycle = args.cycle ?? []
  }
}

export class StartNotFoundError extends errore.createTaggedError({
  name: 'StartNotFoundError',
  message: 'This flow declares no start named $startId',
}) {
  readonly available: readonly string[]

  constructor(args: { startId: string; available?: readonly string[]; cause?: unknown }) {
    super(args)
    this.available = args.available ?? []
  }
}

export class RunInputError extends errore.createTaggedError({
  name: 'RunInputError',
  message: 'The run input for start $startId does not match its schema',
}) {
  readonly issues: readonly SchemaIssue[]

  constructor(args: { startId: string; issues?: readonly SchemaIssue[]; cause?: unknown }) {
    super(args)
    this.issues = args.issues ?? []
  }
}

export class NodeExecutionError extends errore.createTaggedError({
  name: 'NodeExecutionError',
  message: 'Node $nodeId failed',
}) {
  readonly runNumber: number
  readonly frames: readonly StackFrame[]
  readonly hiddenFrames: number

  constructor(args: {
    nodeId: string
    runNumber: number
    frames?: readonly StackFrame[]
    hiddenFrames?: number
    cause?: unknown
  }) {
    super(args)
    this.runNumber = args.runNumber
    this.frames = args.frames ?? []
    this.hiddenFrames = args.hiddenFrames ?? 0
  }
}

export class UpstreamFailedError extends errore.createTaggedError({
  name: 'UpstreamFailedError',
  message: 'Node $nodeId was skipped because upstream node $upstreamNodeId failed',
}) {
  readonly runNumber: number

  constructor(args: {
    nodeId: string
    upstreamNodeId: string
    runNumber: number
    cause?: unknown
  }) {
    super(args)
    this.runNumber = args.runNumber
  }
}

export class FlowSaveError extends errore.createTaggedError({
  name: 'FlowSaveError',
  message: 'Cannot save the flow document at $path',
}) {}

export class FlowRevisionConflictError extends errore.createTaggedError({
  name: 'FlowRevisionConflictError',
  message:
    'The flow document at $path changed on disk: expected revision $expectedRevision but found $actualRevision',
}) {}

export class JobUiSchemaError extends errore.createTaggedError({
  name: 'JobUiSchemaError',
  message: 'Cannot derive an editor schema for field $field of node $nodeId: $reason',
}) {
  readonly io: 'input' | 'output'

  constructor(args: {
    nodeId: string
    field: string
    reason: string
    io: 'input' | 'output'
    cause?: unknown
  }) {
    super(args)
    this.io = args.io
  }
}

export class RunCancelledError extends errore.createTaggedError({
  name: 'RunCancelledError',
  message: 'The run was cancelled',
  extends: errore.AbortError,
}) {
  readonly runNumber: number

  constructor(args: { runNumber: number; cause?: unknown }) {
    super(args)
    this.runNumber = args.runNumber
  }
}

/** Every error this package can return. */
export type JobikError =
  | ConnectionError
  | FlowFileReadError
  | FlowMigrationError
  | FlowRevisionConflictError
  | FlowSaveError
  | FlowSchemaError
  | JobUiSchemaError
  | NodeExecutionError
  | RunCancelledError
  | RunInputError
  | StartNotFoundError
  | UnsupportedFlowVersionError
  | UpstreamFailedError

/** Every `_tag` the taxonomy defines, in declaration order. The wire layer allowlists against it. */
export const jobikErrorTags = [
  'FlowFileReadError',
  'FlowSchemaError',
  'FlowMigrationError',
  'UnsupportedFlowVersionError',
  'ConnectionError',
  'StartNotFoundError',
  'RunInputError',
  'NodeExecutionError',
  'UpstreamFailedError',
  'FlowSaveError',
  'FlowRevisionConflictError',
  'JobUiSchemaError',
  'RunCancelledError',
] as const

export type JobikErrorTag = (typeof jobikErrorTags)[number]
