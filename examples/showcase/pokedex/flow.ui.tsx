import { defineFlowUi } from '@jobik/ui'
import { PokedexCard } from './components/PokedexCard.js'

/**
 * The `pokedex` flow's local output UI, registered alongside the binding in `jobik.config.ts`.
 *
 * The default export is an extension descriptor for the UI loader and nothing else — no
 * application code imports it. The key is the FLOW NODE ID the builder assigned, `compose`, not
 * the definition's name.
 *
 * Only pipeline A is registered. `standings` is intentionally absent so that running the `roster`
 * start falls through to Jobik's generic output viewer, which is what the markdown table and the
 * scalars want anyway.
 *
 * NodeNext needs the `.js` specifier on the import; Vite's extension bundler maps it back to the
 * `.tsx` source.
 */
export default defineFlowUi({
  nodes: { compose: { Output: PokedexCard } },
})
