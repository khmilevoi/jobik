import { describe, expect, it } from 'vitest'
import {
  POKEAPI_POKEMON_ENDPOINT,
  POKEDEX_CARD_START_ID,
  POKEDEX_FLOW_NAME,
  POKEDEX_METRICS,
  POKEDEX_ROSTER_START_ID,
  POKEDEX_STAT_LABELS,
  POKEDEX_THEMES,
  POKEDEX_TYPE_COLOURS,
  POKEDEX_UNKNOWN_TYPE_COLOUR,
  typeColour,
} from './types.js'

/**
 * `types.ts` is the browser-safe half of this example, so this file also stands in for the rule
 * that it stays that way: no `node:` builtin, no handler, no `./nodes/`.
 */

describe('the flow constants', () => {
  it('names the flow and both starts', () => {
    expect(POKEDEX_FLOW_NAME).toBe('pokedex')
    expect(POKEDEX_CARD_START_ID).toBe('card')
    expect(POKEDEX_ROSTER_START_ID).toBe('roster')
  })

  it('points at the free, key-less PokéAPI endpoint', () => {
    expect(POKEAPI_POKEMON_ENDPOINT).toBe('https://pokeapi.co/api/v2/pokemon')
  })

  it('offers three themes and four ranking metrics', () => {
    expect(POKEDEX_THEMES).toEqual(['type', 'midnight', 'parchment'])
    expect(POKEDEX_METRICS).toEqual(['attack', 'defense', 'speed', 'hp'])
  })

  it('labels each metric, so the card and the table agree on the wording', () => {
    for (const metric of POKEDEX_METRICS) {
      expect(POKEDEX_STAT_LABELS[metric]).toBeTypeOf('string')
    }
    expect(POKEDEX_STAT_LABELS['special-attack']).toBe('SP.ATK')
  })
})

describe('typeColour', () => {
  it('knows all eighteen types', () => {
    expect(Object.keys(POKEDEX_TYPE_COLOURS)).toHaveLength(18)
    for (const hex of Object.values(POKEDEX_TYPE_COLOURS)) {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('is case- and whitespace-forgiving', () => {
    expect(typeColour('Fire')).toBe(POKEDEX_TYPE_COLOURS.fire)
    expect(typeColour('  water ')).toBe(POKEDEX_TYPE_COLOURS.water)
  })

  it('falls back rather than returning undefined for a type it has never seen', () => {
    expect(typeColour('stellar')).toBe(POKEDEX_UNKNOWN_TYPE_COLOUR)
    expect(typeColour('')).toBe(POKEDEX_UNKNOWN_TYPE_COLOUR)
  })
})
