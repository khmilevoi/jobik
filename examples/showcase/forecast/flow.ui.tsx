import { defineFlowUi } from '@jobik/ui'

/**
 * The `forecast` flow's local output UI — deliberately empty.
 *
 * `publication` registers a component for its `render` node because it emits an image, and only
 * flow-local code knows how to draw it. This flow emits nothing but numbers and strings, and the
 * whole point of it is to show what the Studio does with those on its own: the generic value
 * viewer types every field of every node's output without a line of flow-local UI.
 *
 * So the empty `nodes` map is the content of this file, not a placeholder. Registering an `Output`
 * component here would hide the thing this example exists to demonstrate. The descriptor is still
 * declared and still named in `jobik.config.ts`, which keeps the extension path exercised.
 */
export default defineFlowUi({ nodes: {} })
