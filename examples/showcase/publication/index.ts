import path from 'node:path'
import * as jobik from '@jobik/core'
import { httpSink } from './nodes/httpSink.js'
import { imageOut } from './nodes/imageOut.js'
import { publicationInput } from './nodes/start.js'

/**
 * The flow binding entrypoint.
 *
 * The named export is for application code; the default export is only for UI discovery. The
 * builder assigns the only id each definition ever has — `start1`, `render` and `publish` are the
 * ids the canvas, the JSON document, the run report and `run()` all use.
 */

const documentPath = path.resolve(path.dirname(import.meta.filename), 'flow.jobik.json')

/** The unbound graph. `fixtures.ts` uses it to bind a copy of the document in a temp directory. */
export function buildPublicationFlow() {
  return jobik
    .flow('publication')
    .start('start1', publicationInput)
    .node('render', imageOut)
    .node('publish', httpSink)
}

export const publication = buildPublicationFlow().bind('path', documentPath)

export default publication
