import * as fs from 'node:fs/promises'
import type { FlowMigrationError, UnsupportedFlowVersionError } from '#errors.js'
import { FlowFileReadError, FlowSchemaError } from '#errors.js'
import type { FlowMigration } from './migrate.js'
import { parseFlowDocument } from './parse.js'
import { revisionOf } from './revision.js'
import type { FlowDocument } from './schema.js'

/** A document as loaded from disk, with the revision of the bytes it was loaded from. */
export type FlowDocumentFile = { readonly document: FlowDocument; readonly revision: string }

/**
 * Load a flow document. Reading and JSON parsing are the two error boundaries: a filesystem
 * failure becomes `FlowFileReadError` and a syntax failure becomes `FlowSchemaError`, both
 * carrying the original as `cause`. The revision is taken from the raw bytes before any
 * normalisation, so it reflects exactly what is on disk.
 */
export async function readFlowDocument(args: {
  path: string
  migrations?: readonly FlowMigration[]
}): Promise<
  | FlowDocumentFile
  | FlowFileReadError
  | FlowSchemaError
  | FlowMigrationError
  | UnsupportedFlowVersionError
> {
  const bytes = await fs
    .readFile(args.path)
    .catch((cause: unknown) => new FlowFileReadError({ path: args.path, cause }))
  if (bytes instanceof Error) return bytes
  const revision = revisionOf(bytes)
  // A hand-edited JSON file on Windows can carry a byte order mark, which JSON.parse rejects.
  const text = bytes.toString('utf8').replace(/^\uFEFF/, '')
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (cause) {
    return new FlowSchemaError({ path: args.path, cause })
  }
  const document = parseFlowDocument({ path: args.path, value, migrations: args.migrations })
  if (document instanceof Error) return document
  return { document, revision }
}
