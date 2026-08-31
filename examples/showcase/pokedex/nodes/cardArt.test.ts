import { Jimp } from 'jimp'
import { describe, expect, it } from 'vitest'
import { recordedArtwork } from '../fixtures.js'
import { POKEDEX_CARD_HEIGHT, POKEDEX_CARD_WIDTH, type PokedexTheme, typeColour } from '../types.js'
import {
  type CardSubject,
  captionFor,
  mix,
  paletteFor,
  pokedexNumber,
  renderCard,
} from './cardArt.js'

/**
 * The rasteriser, exercised directly.
 *
 * Assertions stop at "it decodes, and it is the size the schema promises". PNG bytes travel
 * through zlib, whose output is only stable for a given build — `publication/nodes/httpSink.ts`
 * spells out why byte-exactness is not a safe assertion — so nothing here compares bytes.
 */

const subject: CardSubject = {
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
}

describe('mix', () => {
  it('interpolates between two hex colours and clamps outside 0..1', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff')
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mix('#000000', '#ffffff', 2)).toBe('#ffffff')
    expect(mix('#000000', '#ffffff', -1)).toBe('#000000')
  })
})

describe('paletteFor', () => {
  it('derives the `type` background from the accent and keeps text light', () => {
    const palette = paletteFor('type', typeColour('water'))
    expect(palette.light).toBe(false)
    expect(palette.top).not.toBe(palette.bottom)
    expect(paletteFor('type', typeColour('fire')).top).not.toBe(palette.top)
  })

  it('is the only theme that varies with the pokémon', () => {
    const fire = paletteFor('midnight', typeColour('fire'))
    const water = paletteFor('midnight', typeColour('water'))
    expect(fire).toEqual(water)
  })

  it('flips to dark text on the light theme', () => {
    expect(paletteFor('parchment', typeColour('grass')).light).toBe(true)
  })
})

describe('pokedexNumber and captionFor', () => {
  it('pads the number the way the games print it', () => {
    expect(pokedexNumber(6)).toBe('#006')
    expect(pokedexNumber(151)).toBe('#151')
  })

  it('reads as a pokédex line, with both types and the base stat total', () => {
    expect(captionFor(subject)).toBe('#006 Charizard — fire / flying · 534 BST')
  })

  it('omits the empty second type', () => {
    expect(captionFor({ ...subject, secondaryType: '' })).toContain('— fire ·')
  })
})

describe('renderCard', () => {
  const themes: readonly PokedexTheme[] = ['type', 'midnight', 'parchment']

  for (const theme of themes) {
    it(`renders a decodable PNG at the declared size for the ${theme} theme`, async () => {
      const png = await renderCard({
        subject: { ...subject, theme },
        artworkPng: recordedArtwork(),
      })
      expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
      const decoded = await Jimp.read(png)
      expect(decoded.bitmap.width).toBe(POKEDEX_CARD_WIDTH)
      expect(decoded.bitmap.height).toBe(POKEDEX_CARD_HEIGHT)
    })
  }

  it('paints the accent rule at the top from the primary type', async () => {
    const png = await renderCard({ subject, artworkPng: recordedArtwork() })
    const decoded = await Jimp.read(png)
    // `0xRRGGBBAA` at a pixel inside the top rule, compared against the type colour it is drawn in.
    const pixel = decoded.getPixelColor(10, 2) >>> 8
    expect(`#${pixel.toString(16).padStart(6, '0')}`).toBe(typeColour('fire'))
  })

  it('draws a different card for a different theme', async () => {
    const first = await renderCard({ subject, artworkPng: recordedArtwork() })
    const second = await renderCard({
      subject: { ...subject, theme: 'parchment' },
      artworkPng: recordedArtwork(),
    })
    expect(first.equals(second)).toBe(false)
  })

  it('rejects an artwork buffer jimp cannot decode, for `compose` to turn into a value', async () => {
    await expect(
      renderCard({ subject, artworkPng: Buffer.from('not an image') }),
    ).rejects.toBeInstanceOf(Error)
  })
})
