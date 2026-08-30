import { createHash } from 'node:crypto'
import * as jobik from '@jobik/core'
import * as z from 'zod'
import { PUBLICATION_ASSET_NAME, PUBLICATION_CDN_BASE, PUBLICATION_IMAGE_MIME } from '../types.js'

/**
 * The design's `Inventory` row `httpSink` · sink, attached by `index.ts` as `publish`.
 *
 * It performs no upload. This example is exercised by `turbo run test` and by the end-to-end
 * Studio test, neither of which has a network, so the handler derives the canonical publication
 * URL from a digest of what it was given — the same shape the Output viewer artboard shows,
 * `https://cdn.jobik.dev/p/<segment>/cover.png`. A real deployment replaces the body of `run`
 * with the upload and keeps the schemas untouched.
 *
 * `kind: 'sink'` is presentation metadata only: it groups and labels the node in the editor and
 * affects neither binding, nor validation, nor execution.
 */
export const httpSink = jobik.node({
  title: 'Publish image',
  kind: 'sink',
  input: z.object({
    image: jobik.asset({ mime: PUBLICATION_IMAGE_MIME }),
    caption: z.string(),
  }),
  output: z.object({ url: z.string().url() }),
  run: (input) => {
    const digest = createHash('sha256')
      .update(input.image)
      .update('\n')
      .update(input.caption)
      .digest('hex')
      .slice(0, 12)
    return { url: `${PUBLICATION_CDN_BASE}/${digest}/${PUBLICATION_ASSET_NAME}` }
  },
})
