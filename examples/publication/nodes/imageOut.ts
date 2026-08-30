import * as jobik from '@jobik/core'
import * as errore from 'errore'
import * as z from 'zod'
import {
  PUBLICATION_IMAGE_HEIGHT,
  PUBLICATION_IMAGE_MIME,
  PUBLICATION_IMAGE_WIDTH,
} from '../types.js'
import { captionFor, unsupportedColourProfile } from './markdownText.js'
import { encodePng, type Rgb } from './png.js'

/**
 * The design's `Inventory` row `imageOut` · renderer, attached by `index.ts` as `render`.
 *
 * Emits a binary `image` field declared with `jobik.asset()` alongside a `caption` string, exactly
 * as the `render` card shows. The handler is pure and offline: it rasterises a banded card whose
 * colours come from a hash of the text, so the same input always produces the same bytes.
 */

/** The example's own expected failure. Core's taxonomy is frozen; this belongs to the example. */
export class ImageRenderError extends errore.createTaggedError({
  name: 'ImageRenderError',
  message: 'Unsupported colour profile $profile in the markdown asset at line $line',
}) {}

/** FNV-1a, 32-bit. Deterministic across runs and platforms. */
function hashOf(text: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index) & 0xff
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

/** Rasterise the card: a flat background with a lighter band across the upper third. */
function raster(text: string): Buffer {
  const hash = hashOf(text)
  const background: Rgb = [(hash >>> 16) & 0x3f, (hash >>> 8) & 0x3f, hash & 0x3f]
  const band: Rgb = [background[0] + 0x40, background[1] + 0x60, background[2] + 0x50]
  const bandStart = Math.floor(PUBLICATION_IMAGE_HEIGHT / 3)
  const bandEnd = bandStart + Math.floor(PUBLICATION_IMAGE_HEIGHT / 12)
  return encodePng({
    width: PUBLICATION_IMAGE_WIDTH,
    height: PUBLICATION_IMAGE_HEIGHT,
    pixel: (_x, y) => (y >= bandStart && y < bandEnd ? band : background),
  })
}

export const imageOut = jobik.node({
  title: 'Render image',
  kind: 'transform',
  input: z.object({ title: z.string(), markdown: z.string() }),
  output: z.object({
    image: jobik.asset({ mime: PUBLICATION_IMAGE_MIME }),
    caption: z.string(),
  }),
  run: (input) => {
    const unsupported = unsupportedColourProfile(input.markdown)
    if (unsupported !== undefined) return new ImageRenderError(unsupported)
    return {
      image: raster(`${input.title}\n${input.markdown}`),
      caption: captionFor(input),
    }
  },
})
