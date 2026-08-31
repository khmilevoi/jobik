import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import { FlowFileReadError } from '#errors.js'

/**
 * The document revision: a sha256 hex digest of the exact bytes of a document, never of the parsed
 * value. A whitespace-only external edit is drift, and the save path must see it as such. The
 * string is opaque — callers compare it, never parse it. A string and its utf-8 bytes hash alike,
 * so hashing the text about to be written yields the revision a re-read would produce.
 */
export function revisionOf(contents: string | Uint8Array): string {
  return createHash('sha256').update(contents).digest('hex')
}

/** Read a document's current revision without parsing it. Reading is an error boundary. */
export async function readFlowRevision(args: {
  path: string
}): Promise<string | FlowFileReadError> {
  const bytes = await fs
    .readFile(args.path)
    .catch((cause: unknown) => new FlowFileReadError({ path: args.path, cause }))
  if (bytes instanceof Error) return bytes
  return revisionOf(bytes)
}
