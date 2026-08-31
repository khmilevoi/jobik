import * as z from 'zod'
import { FlowMigrationError, UnsupportedFlowVersionError } from '#errors.js'
import { CURRENT_FLOW_VERSION, FLOW_DOCUMENT_FORMAT, type FlowDocumentEnvelope } from './schema.js'

/**
 * One step of the sequential pipeline. A step declares only the version it reads; it always
 * produces `from + 1`, and the pipeline stamps the new `version` itself, so no step can forget to
 * bump it, and the loop is provably finite. A step may return an error value or throw — either
 * becomes a `FlowMigrationError`.
 */
export type FlowMigration = {
  readonly from: number
  readonly migrate: (document: FlowDocumentEnvelope) => unknown
}

/**
 * The shipped version registry. Empty: v1 is the only version this build has ever written, so
 * there is no older shape on any disk. Tests inject steps through the `migrations` argument.
 */
export const flowMigrations: readonly FlowMigration[] = []

/** A step's output must still be a Jobik document; its `version` is the pipeline's to set. */
const migrationOutputSchema = z.looseObject({ format: z.literal(FLOW_DOCUMENT_FORMAT) })

/**
 * Migrate a document to `CURRENT_FLOW_VERSION`, one version at a time. A version this build cannot
 * reach — from the future, or older than any registered step — is `UnsupportedFlowVersionError`; a
 * step that ran and failed is `FlowMigrationError`.
 */
export function migrateFlowDocument(args: {
  path: string
  document: FlowDocumentEnvelope
  migrations?: readonly FlowMigration[]
}): FlowDocumentEnvelope | FlowMigrationError | UnsupportedFlowVersionError {
  const migrations = args.migrations ?? flowMigrations
  let current = args.document
  if (current.version > CURRENT_FLOW_VERSION) {
    return new UnsupportedFlowVersionError({
      path: args.path,
      version: current.version,
      supported: CURRENT_FLOW_VERSION,
    })
  }
  while (current.version < CURRENT_FLOW_VERSION) {
    const version = current.version
    const step = migrations.find((candidate) => candidate.from === version)
    if (step === undefined) {
      return new UnsupportedFlowVersionError({
        path: args.path,
        version,
        supported: CURRENT_FLOW_VERSION,
      })
    }
    const to = step.from + 1
    try {
      const output = step.migrate(current)
      if (output instanceof Error) {
        return new FlowMigrationError({ path: args.path, from: step.from, to, cause: output })
      }
      const checked = migrationOutputSchema.safeParse(output)
      if (!checked.success) {
        return new FlowMigrationError({
          path: args.path,
          from: step.from,
          to,
          cause: checked.error,
        })
      }
      current = { ...checked.data, version: to }
    } catch (cause) {
      return new FlowMigrationError({ path: args.path, from: step.from, to, cause })
    }
  }
  return current
}
