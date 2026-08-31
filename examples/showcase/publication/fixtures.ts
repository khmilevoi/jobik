import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'
import { buildPublicationFlow } from './index.js'
import {
  PUBLICATION_ASSET_NAME,
  PUBLICATION_CDN_BASE,
  PUBLICATION_FLOW_NAME,
  PUBLICATION_START_ID,
} from './types.js'

/**
 * Fixture helpers for the publication example.
 *
 * The server plan and the integration plan bind against these rather than re-deriving paths or
 * re-typing the sample values. Node-only: this file reaches the filesystem and must never be
 * imported by browser code — that is what `types.ts` is for.
 *
 * Consumers inside `packages/ui` import this file by relative path and must NOT add
 * `@jobik/examples` to `@jobik/ui`'s dependencies: `flow.ui.tsx` imports `@jobik/ui`, and the pair
 * would be a cycle in turbo's workspace graph.
 */

const root = path.dirname(import.meta.filename)

export const publicationFixture = {
  /** The example's directory. */
  root,
  /** The binding entrypoint `../jobik.config.ts` points at. Absolute. */
  bindingPath: path.resolve(root, 'index.ts'),
  /** The flow document the binding is bound to. Absolute. */
  documentPath: path.resolve(root, 'flow.jobik.json'),
  flowName: PUBLICATION_FLOW_NAME,
  startId: PUBLICATION_START_ID,
  nodeIds: ['start1', 'render', 'publish'],
} as const

/** The `title` and `markdown` values the `Studio — default` run panel shows. */
export const publicationSampleInput = {
  title: 'Typed flows, quietly',
  markdown: [
    '## Release 0.4',
    'Field-level connections are now',
    'validated against the compiler',
    'output before every run.',
    '',
  ].join('\n'),
} as const

/** The caption the `Output viewer` artboard shows for that input. */
export const publicationExpectedCaption = 'Release 0.4 — field-level connections'

/** Escape the regex metacharacters in `text` so it can be embedded literally in a `RegExp`. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The URL shape the `Output viewer` artboard shows, derived from `PUBLICATION_CDN_BASE` and
 * `PUBLICATION_ASSET_NAME` so it cannot go stale if either constant changes. The digest segment is
 * content-addressed: exactly 12 lowercase hex characters.
 */
export const publicationExpectedUrlPattern = new RegExp(
  `^${escapeRegExp(PUBLICATION_CDN_BASE)}/[0-9a-f]{12}/${escapeRegExp(PUBLICATION_ASSET_NAME)}$`,
)

/** The same graph bound to another document. `documentPath` must be absolute. */
export function bindPublicationTo(documentPath: string) {
  return buildPublicationFlow().bind('path', documentPath)
}

/**
 * Copy `flow.jobik.json` into a fresh temp directory, so a save, a revision conflict or a
 * migration test can rewrite it without touching the committed example.
 */
export async function createPublicationDocumentCopy(): Promise<{
  documentPath: string
  directory: string
  cleanup: () => Promise<void>
}> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jobik-publication-'))
  const documentPath = path.resolve(directory, 'flow.jobik.json')
  try {
    await fs.copyFile(publicationFixture.documentPath, documentPath)
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true })
    throw error
  }
  return {
    documentPath,
    directory,
    cleanup: () => fs.rm(directory, { recursive: true, force: true }),
  }
}
