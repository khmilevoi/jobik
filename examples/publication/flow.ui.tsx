import { defineFlowUi } from '@jobik/ui'
import { RenderedImage } from './components/RenderedImage.js'

/**
 * `## Flow-local output UI`: registered alongside the binding in `jobik.config.ts` (P10).
 *
 * The default export is an extension descriptor for the UI loader and nothing else — no
 * application code imports it. `render` is the id `index.ts` assigns to the `imageOut` definition.
 *
 * The spec's snippet writes the import without an extension; NodeNext needs the `.js` specifier,
 * and Vite's bundler (P13) maps it back to the `.tsx` source.
 */
export default defineFlowUi({
  nodes: { render: { Output: RenderedImage } },
})
