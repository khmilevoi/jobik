import * as jobik from '@jobik/core'
import * as errore from 'errore'
import * as z from 'zod'
import { POKEDEX_ARTWORK_MIME } from '../types.js'

/**
 * Pipeline A's second node, attached by `index.ts` as `sprite`.
 *
 * A real download of the official artwork PokéAPI pointed `lookup` at. The bytes ride on as a
 * `jobik.asset()` field, which means the run report carries the real `Buffer` in process and an
 * `AssetDescriptor` once the server has projected it for the browser.
 *
 * The asset field is TOP LEVEL and has to be: `collectAssets` walks the output shape one level
 * deep, so a `Buffer` tucked inside an object or an array is never registered and never reaches
 * the viewer.
 */

/** The artwork host answered, but not with an image. */
export class ArtworkFetchError extends errore.createTaggedError({
  name: 'ArtworkFetchError',
  message: 'The artwork at $url answered $status',
}) {
  readonly status: number

  constructor(args: { url: string; status: number; cause?: unknown }) {
    super(args)
    this.status = args.status
  }
}

/** The artwork host could not be reached at all. */
export class ArtworkUnreachableError extends errore.createTaggedError({
  name: 'ArtworkUnreachableError',
  message: 'The artwork at $url could not be downloaded',
}) {}

/** A 200 that is not a PNG. Checked against the eight-byte signature, not the content type. */
export class ArtworkFormatError extends errore.createTaggedError({
  name: 'ArtworkFormatError',
  message: 'The artwork at $url is not a PNG',
}) {}

/** The eight bytes every PNG starts with. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export const sprite = jobik.node({
  title: 'Download artwork',
  kind: 'transform',
  input: z.object({ artworkUrl: z.url() }),
  output: z.object({
    sprite: jobik.asset({ mime: POKEDEX_ARTWORK_MIME }),
    sourceUrl: z.url(),
  }),
  run: async (input, context) => {
    const url = input.artworkUrl
    context.log(`GET ${url}`)

    const response = await fetch(url, { signal: context.signal }).catch(
      (cause: unknown) => new ArtworkUnreachableError({ url, cause }),
    )
    if (response instanceof Error) return response
    if (!response.ok) return new ArtworkFetchError({ url, status: response.status })

    const body = await response
      .arrayBuffer()
      .catch((cause: unknown) => new ArtworkUnreachableError({ url, cause }))
    if (body instanceof Error) return body

    const bytes = Buffer.from(body)
    // The content type is whatever the CDN felt like sending; the signature is what jimp will
    // actually try to decode, so that is what this checks before handing `compose` a surprise.
    if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      return new ArtworkFormatError({ url })
    }

    context.log(`${bytes.byteLength} bytes`)
    return { sprite: bytes, sourceUrl: url }
  },
})
