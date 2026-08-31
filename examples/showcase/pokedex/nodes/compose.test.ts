import { describe, expect, it } from 'vitest'
import { recordedArtwork } from '../fixtures.js'
import { POKEDEX_CARD_HEIGHT, POKEDEX_CARD_WIDTH } from '../types.js'
import { CardRenderError, compose } from './compose.js'

const context = { signal: new AbortController().signal, log: () => {} }

/** The handler's own parameter type, so the fixture cannot drift from the schema. */
type ComposeInput = Parameters<typeof compose.run>[0]

const input: ComposeInput = {
  displayName: 'Charizard',
  number: 6,
  primaryType: 'fire',
  secondaryType: 'flying',
  stats: [
    { label: 'HP', base: 78 },
    { label: 'ATK', base: 84 },
    { label: 'DEF', base: 78 },
    { label: 'SP.ATK', base: 109 },
    { label: 'SP.DEF', base: 85 },
    { label: 'SPD', base: 100 },
  ],
  theme: 'type',
  sprite: recordedArtwork(),
}

describe('compose', () => {
  it('takes the theme straight from the start and the sprite as an asset', () => {
    expect(compose.kind).toBe('transform')
    expect(Object.keys(compose.input.shape)).toEqual([
      'displayName',
      'number',
      'primaryType',
      'secondaryType',
      'stats',
      'theme',
      'sprite',
    ])
    expect(Object.keys(compose.output.shape)).toEqual([
      'image',
      'caption',
      'primaryType',
      'secondaryType',
    ])
  })

  it('emits a PNG Buffer at the declared card dimensions', async () => {
    const result = await compose.run({ ...input }, context)
    if (result instanceof Error) throw result
    expect(Buffer.isBuffer(result.image)).toBe(true)
    expect(result.image.subarray(1, 4).toString('ascii')).toBe('PNG')
    // The IHDR chunk starts at byte 8; width and height are the first two fields of its payload.
    expect(result.image.readUInt32BE(16)).toBe(POKEDEX_CARD_WIDTH)
    expect(result.image.readUInt32BE(20)).toBe(POKEDEX_CARD_HEIGHT)
  })

  it('emits the caption the output viewer prints, and re-emits the types for the component', async () => {
    const result = await compose.run({ ...input }, context)
    if (result instanceof Error) throw result
    expect(result.caption).toBe('#006 Charizard — fire / flying · 534 BST')
    expect(result.primaryType).toBe('fire')
    expect(result.secondaryType).toBe('flying')
  })

  it('produces output its own schema accepts', async () => {
    const result = await compose.run({ ...input }, context)
    expect(compose.output.safeParse(result).success).toBe(true)
  })

  it('logs what it is composing and how big the result was', async () => {
    const logs: string[] = []
    await compose.run({ ...input }, { ...context, log: (m: string) => logs.push(m) })
    expect(logs[0]).toBe('composing a type card for Charizard')
    expect(logs[1]).toMatch(/^\d+ bytes of PNG$/)
  })

  it('returns CardRenderError rather than letting jimp throw through the handler', async () => {
    const result = await compose.run({ ...input, sprite: Buffer.from('not a png') }, context)
    expect(result).toBeInstanceOf(CardRenderError)
    if (!(result instanceof CardRenderError)) return
    expect(result._tag).toBe('CardRenderError')
    expect(result.message).toContain('Charizard')
    expect(result.cause).toBeDefined()
  })
})
