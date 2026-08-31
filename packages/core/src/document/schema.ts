import * as z from 'zod'
import type { SchemaIssue } from '#errors.js'

/** The `format` marker that identifies a Jobik flow document. */
export const FLOW_DOCUMENT_FORMAT = 'jobik.flow'

/** The document version this build reads and writes. `version` covers the whole file. */
export const CURRENT_FLOW_VERSION = 1

/** One end of a connection: a field on a node. Structurally the taxonomy's `FieldRef`. */
export const flowFieldRefSchema = z.object({
  node: z.string().min(1),
  field: z.string().min(1),
})

/**
 * Connections are field-to-field. Unlike the top level, unknown keys inside a connection are
 * stripped rather than rejected — deliberately: the spec's "never duplicates node definitions,
 * schemas, handlers, or start declarations" is a statement about the top level, not this shape.
 */
export const flowConnectionSchema = z.object({
  from: flowFieldRefSchema,
  to: flowFieldRefSchema,
})

/** Layout is editor state: a canvas position per node id. */
export const flowNodePositionSchema = z.strictObject({ x: z.number(), y: z.number() })

/**
 * The version envelope, checked before migration. Loose on purpose: it must accept a document of
 * any past version and hand the whole object — unknown keys and all — to the migration pipeline.
 */
export const flowEnvelopeSchema = z.looseObject({
  format: z.literal(FLOW_DOCUMENT_FORMAT),
  version: z.int(),
})

/**
 * The current-version document. Strict: the file holds only mutable graph composition, so any key
 * beyond these five — a node definition, a schema, a handler, a start — is a validation failure
 * rather than data silently dropped on the next save.
 */
export const flowDocumentSchema = z.strictObject({
  format: z.literal(FLOW_DOCUMENT_FORMAT),
  version: z.literal(CURRENT_FLOW_VERSION),
  connections: z.array(flowConnectionSchema).default([]),
  literals: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
  layout: z.record(z.string(), flowNodePositionSchema).default({}),
})

export type FlowConnection = z.infer<typeof flowConnectionSchema>
export type FlowNodePosition = z.infer<typeof flowNodePositionSchema>
export type FlowDocumentEnvelope = z.infer<typeof flowEnvelopeSchema>
export type FlowDocument = z.infer<typeof flowDocumentSchema>

/** Flatten a Zod failure into the taxonomy's wire-safe issue shape. */
export function toSchemaIssues(error: z.ZodError): readonly SchemaIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }))
}

/**
 * The canonical on-disk text for a document: fixed key order, two-space indent, trailing newline.
 * Key order inside `literals` and `layout` and the order of `connections` are preserved as given,
 * so a save rewrites only what the editor actually changed. Precondition: `literals` must hold
 * only JSON values, as it does for any document from `parseFlowDocument` or `readFlowDocument` —
 * `JSON.stringify` throws on a BigInt or a circular reference, and a hand-built document holding
 * one is a caller error, not one this function reports.
 */
export function serializeFlowDocument(document: FlowDocument): string {
  const ordered = {
    format: FLOW_DOCUMENT_FORMAT,
    version: CURRENT_FLOW_VERSION,
    connections: document.connections,
    literals: document.literals,
    layout: document.layout,
  }
  return `${JSON.stringify(ordered, null, 2)}\n`
}
