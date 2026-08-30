import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'
import { buildPublicationFlow } from './index.js'
import { PUBLICATION_FLOW_NAME, PUBLICATION_START_ID } from './types.js'

/**
 * Fixture helpers for the publication example.
 *
 * The server plan and the integration plan bind against these rather than re-deriving paths or
 * re-typing the sample values. Node-only: this file reaches the filesystem and must never be
 * imported by browser code — that is what `types.ts` is for.
 *
 * Consumers inside `packages/ui` import this file by relative path and must NOT add
 * `@jobik/example-publication` to `@jobik/ui`'s dependencies: P12 adds `flow.ui.tsx`, which
 * imports `@jobik/ui`, and the pair would be a cycle in turbo's workspace graph.
 */

const root = path.dirname(import.meta.filename)

export const publicationFixture = {
  /** The example's directory. */
  root,
  /** The binding entrypoint `jobik.config.ts` points at. Absolute. */
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

/** The URL shape the `Output viewer` artboard shows. The digest segment is content-addressed. */
export const publicationExpectedUrlPattern =
  /^https:\/\/cdn\.jobik\.dev\/p\/[0-9a-f]{12}\/cover\.png$/

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
  await fs.copyFile(publicationFixture.documentPath, documentPath)
  return {
    documentPath,
    directory,
    cleanup: () => fs.rm(directory, { recursive: true, force: true }),
  }
}
