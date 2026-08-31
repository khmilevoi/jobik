import { afterEach, describe, expect, it, vi } from 'vitest'
import { recordedArtwork, stubPokeApiFetch } from '../fixtures.js'
import { POKEDEX_ARTWORK_MIME } from '../types.js'
import { ArtworkFetchError, ArtworkFormatError, ArtworkUnreachableError, sprite } from './sprite.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

const artworkUrl =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png'

function context() {
  const logs: string[] = []
  return { logs, ctx: { signal: new AbortController().signal, log: (m: string) => logs.push(m) } }
}

describe('sprite', () => {
  it('declares its binary output at the top level, where collectAssets can see it', () => {
    expect(sprite.kind).toBe('transform')
    expect(Object.keys(sprite.input.shape)).toEqual(['artworkUrl'])
    expect(Object.keys(sprite.output.shape)).toEqual(['sprite', 'sourceUrl'])
  })

  it('returns the downloaded PNG as a Buffer alongside the URL it came from', async () => {
    vi.stubGlobal('fetch', stubPokeApiFetch())
    const { ctx, logs } = context()
    const result = await sprite.run({ artworkUrl }, ctx)
    if (result instanceof Error) throw result
    expect(Buffer.isBuffer(result.sprite)).toBe(true)
    expect(result.sprite.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(result.sprite.equals(recordedArtwork())).toBe(true)
    expect(result.sourceUrl).toBe(artworkUrl)
    expect(sprite.output.safeParse(result).success).toBe(true)
    expect(logs[0]).toBe(`GET ${artworkUrl}`)
  })

  it('declares the mime the asset field carries', () => {
    expect(POKEDEX_ARTWORK_MIME).toBe('image/png')
  })

  it('returns ArtworkFetchError carrying the status when the host says no', async () => {
    vi.stubGlobal('fetch', async () => new Response('gone', { status: 404 }))
    const { ctx } = context()
    const result = await sprite.run({ artworkUrl }, ctx)
    expect(result).toBeInstanceOf(ArtworkFetchError)
    if (!(result instanceof ArtworkFetchError)) return
    expect(result.status).toBe(404)
    expect(result.message).toContain(artworkUrl)
  })

  it('returns ArtworkUnreachableError when the artwork URL cannot be reached at all', async () => {
    vi.stubGlobal('fetch', stubPokeApiFetch({ artworkUnreachable: true }))
    const { ctx } = context()
    const result = await sprite.run({ artworkUrl }, ctx)
    expect(result).toBeInstanceOf(ArtworkUnreachableError)
    expect(result).not.toBeInstanceOf(ArtworkFetchError)
  })

  it('returns ArtworkFormatError for a 200 that is not a PNG, whatever the header claims', async () => {
    vi.stubGlobal('fetch', stubPokeApiFetch({ artworkBody: Buffer.from('<html>nope</html>') }))
    const { ctx } = context()
    const result = await sprite.run({ artworkUrl }, ctx)
    expect(result).toBeInstanceOf(ArtworkFormatError)
    if (!(result instanceof ArtworkFormatError)) return
    expect(result._tag).toBe('ArtworkFormatError')
  })
})
