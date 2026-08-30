import type { AssetDescriptor } from '@jobik/core'

/**
 * Browser-safe shared types and constants for the publication example.
 *
 * `flow.ui.tsx` (P12) imports only from this file. Nothing here may import a handler, a `node:`
 * builtin, or `./nodes/`.
 */

/** The flow name the builder assigns, shown in the top bar and the `Flows` list. */
export const PUBLICATION_FLOW_NAME = 'publication'

/** The only start this flow declares. */
export const PUBLICATION_START_ID = 'start1'

/** The raster the `imageOut` definition emits. The design's metadata row reads `1024×1024`. */
export const PUBLICATION_IMAGE_WIDTH = 1024
export const PUBLICATION_IMAGE_HEIGHT = 1024

/** The mime `jobik.asset()` is declared with, and the profile the encoder writes an sRGB chunk for. */
export const PUBLICATION_IMAGE_MIME = 'image/png'
export const PUBLICATION_COLOUR_PROFILE = 'sRGB'

/** The primary asset name and CDN base the Output viewer artboard shows. */
export const PUBLICATION_ASSET_NAME = 'cover.png'
export const PUBLICATION_CDN_BASE = 'https://cdn.jobik.dev/p'

/** Every id the flow builder assigns, in the order `index.ts` attaches them. */
export type PublicationNodeId = 'start1' | 'render' | 'publish'

/** What a caller hands `run('start1', input)`. */
export type PublicationStartInput = { readonly title: string; readonly markdown: string }

/**
 * `render`'s output as the browser sees it: the server replaces the in-process `Buffer` with an
 * `AssetDescriptor` as the report crosses the wire. In process the field is a `Buffer`.
 */
export type PublicationRenderOutputWire = {
  readonly image: AssetDescriptor
  readonly caption: string
}

/** `publish`'s output. Rendered in the completed run panel as accent mono. */
export type PublicationPublishOutput = { readonly url: string }
