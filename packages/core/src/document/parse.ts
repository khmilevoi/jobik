import type { FlowMigrationError, UnsupportedFlowVersionError } from '#errors.js'
import { FlowSchemaError } from '#errors.js'
import { type FlowMigration, migrateFlowDocument } from './migrate.js'
import {
  type FlowDocument,
  flowDocumentSchema,
  flowEnvelopeSchema,
  toSchemaIssues,
} from './schema.js'

/**
 * Turn an already-parsed JSON value into a validated current-version document: detect the version,
 * migrate it sequentially, then validate the migrated document — in that order, because a past
 * version is not expected to satisfy the current schema.
 */
export function parseFlowDocument(args: {
  path: string
  value: unknown
  migrations?: readonly FlowMigration[]
}): FlowDocument | FlowSchemaError | FlowMigrationError | UnsupportedFlowVersionError {
  const envelope = flowEnvelopeSchema.safeParse(args.value)
  if (!envelope.success) {
    return new FlowSchemaError({
      path: args.path,
      issues: toSchemaIssues(envelope.error),
      cause: envelope.error,
    })
  }
  const migrated = migrateFlowDocument({
    path: args.path,
    document: envelope.data,
    migrations: args.migrations,
  })
  if (migrated instanceof Error) return migrated
  const document = flowDocumentSchema.safeParse(migrated)
  if (!document.success) {
    return new FlowSchemaError({
      path: args.path,
      issues: toSchemaIssues(document.error),
      cause: document.error,
    })
  }
  return document.data
}
