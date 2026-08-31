import { createHash } from 'node:crypto'
import * as jobik from '@jobik/core'
import * as z from 'zod'
import { PUBLICATION_ASSET_NAME, PUBLICATION_CDN_BASE, PUBLICATION_IMAGE_MIME } from '../types.js'

/**
 * The design's `Inventory` row `httpSink` · sink, attached by `index.ts` as `publish`.
 *
 * It performs no upload. This example is exercised by `turbo run test`, which does not have a
 * network, so the handler derives the canonical publication URL from a digest of what it was given
 * — the same shape the Output viewer artboard shows, `https://cdn.jobik.dev/p/<segment>/cover.png`.
 * A real deployment replaces the body of `run` with the upload and keeps the schemas untouched.
 *
 * The digest segment is computed from `imageOut`'s PNG bytes, which pass through `deflateSync`;
 * that output is only guaranteed stable for a given zlib build, so the concrete URL is not stable
 * across Node/zlib versions — only its shape is. Later plans must assert the shape, never an exact
 * URL.
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
    // Use length-prefixing with UTF-16LE encoding to make the digest unambiguous and uniquely
    // decodable: each field is prefixed with its length in bytes (zero-padded to 16 chars), and
    // the caption is encoded as UTF-16LE (not UTF-8) so that distinct strings always produce
    // distinct byte sequences, including those with unpaired surrogates.
    const imageLen = input.image.length.toString(16).padStart(16, '0')
    const captionBuffer = Buffer.from(input.caption, 'utf16le')
    const captionLen = captionBuffer.length.toString(16).padStart(16, '0')
    const digest = createHash('sha256')
      .update(imageLen)
      .update(input.image)
      .update(captionLen)
      .update(captionBuffer)
      .digest('hex')
      .slice(0, 12)
    return { url: `${PUBLICATION_CDN_BASE}/${digest}/${PUBLICATION_ASSET_NAME}` }
  },
})
