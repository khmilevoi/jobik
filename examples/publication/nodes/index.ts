import { httpSink } from './httpSink.js'
import { imageOut } from './imageOut.js'
import { markdown } from './markdown.js'
import { publicationInput } from './start.js'

export { httpSink } from './httpSink.js'
export { ImageRenderError, imageOut } from './imageOut.js'
export { markdown } from './markdown.js'
export { publicationInput } from './start.js'

/**
 * The `Inventory` group of the design's left sidebar, verbatim: the flow's node definitions with
 * the label the artboard prints to their right. `markdown` is listed and not attached — the flow
 * has three nodes and the inventory has four rows, and Inventory is read-only reference in v1.
 */
export const publicationInventory = [
  { name: 'start<T>', label: 'entry', definition: publicationInput },
  { name: 'markdown', label: 'transform', definition: markdown },
  { name: 'imageOut', label: 'renderer', definition: imageOut },
  { name: 'httpSink', label: 'sink', definition: httpSink },
] as const
