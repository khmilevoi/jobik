import { afterEach, describe, expect, it, vi } from 'vitest'
import { recordedPokemon, stubPokeApiFetch } from '../fixtures.js'
import {
  artworkUrlOf,
  displayNameOf,
  fetchPokemon,
  normalisePokemonName,
  PokeApiPayloadError,
  PokeApiRequestError,
  PokeApiUnreachableError,
  PokemonNotFoundError,
  parseNameList,
  statValue,
} from './pokeapi.js'

/**
 * The gate has no network, so nothing here ever reaches pokeapi.co: `stubPokeApiFetch` answers out
 * of the recordings under `fixtures/`, which were taken once from the live API.
 */

afterEach(() => {
  vi.unstubAllGlobals()
})

const signal = new AbortController().signal

async function lookup(name: string, options?: Parameters<typeof stubPokeApiFetch>[0]) {
  vi.stubGlobal('fetch', stubPokeApiFetch(options))
  return await fetchPokemon({ name, signal })
}

describe('normalisePokemonName', () => {
  it('lowercases, trims and hyphenates the way PokéAPI spells names', () => {
    expect(normalisePokemonName('  Pikachu ')).toBe('pikachu')
    expect(normalisePokemonName('Mr. Mime')).toBe('mr-mime')
    expect(normalisePokemonName('Farfetch’d')).toBe('farfetchd')
    expect(normalisePokemonName('TYPE NULL')).toBe('type-null')
  })
})

describe('displayNameOf', () => {
  it('title-cases each hyphenated part', () => {
    expect(displayNameOf('pikachu')).toBe('Pikachu')
    expect(displayNameOf('mr-mime')).toBe('Mr Mime')
  })
})

describe('parseNameList', () => {
  it('splits on commas, newlines and semicolons and normalises each name', () => {
    expect(parseNameList('Pikachu, Charizard\nSnorlax;Mr. Mime')).toEqual([
      'pikachu',
      'charizard',
      'snorlax',
      'mr-mime',
    ])
  })

  it('drops blanks and collapses duplicates while keeping the first position', () => {
    expect(parseNameList('pikachu,,PIKACHU\n\n charizard ')).toEqual(['pikachu', 'charizard'])
  })

  it('is empty for a string of separators', () => {
    expect(parseNameList(' , \n ; ')).toEqual([])
  })
})

describe('fetchPokemon', () => {
  it('flattens the recorded document into the record the nodes pass around', async () => {
    const record = await lookup('Charizard')
    if (record instanceof Error) throw record
    expect(record.number).toBe(6)
    expect(record.displayName).toBe('Charizard')
    expect(record.primaryType).toBe('fire')
    expect(record.secondaryType).toBe('flying')
    expect(record.types).toEqual(['fire', 'flying'])
    expect(record.stats.map((stat) => stat.label)).toEqual([
      'HP',
      'ATK',
      'DEF',
      'SP.ATK',
      'SP.DEF',
      'SPD',
    ])
    expect(record.statTotal).toBe(record.stats.reduce((sum, stat) => sum + stat.base, 0))
    expect(record.artworkDefault).toContain('official-artwork')
  })

  it('leaves secondaryType empty for a single-type pokémon', async () => {
    const record = await lookup('pikachu')
    if (record instanceof Error) throw record
    expect(record.types).toEqual(['electric'])
    expect(record.secondaryType).toBe('')
  })

  it('returns PokemonNotFoundError for a name the API answers 404 for', async () => {
    const result = await lookup('mudkipz')
    expect(result).toBeInstanceOf(PokemonNotFoundError)
    if (!(result instanceof PokemonNotFoundError)) return
    expect(result._tag).toBe('PokemonNotFoundError')
    expect(result.message).toContain('mudkipz')
  })

  it('returns PokemonNotFoundError without making a request for an empty name', async () => {
    const calls: string[] = []
    const result = await lookup('   ', { calls })
    expect(result).toBeInstanceOf(PokemonNotFoundError)
    expect(calls).toEqual([])
  })

  it('returns PokeApiRequestError carrying the status for any other failure', async () => {
    const result = await lookup('pikachu', { status: { pikachu: 503 } })
    expect(result).toBeInstanceOf(PokeApiRequestError)
    if (!(result instanceof PokeApiRequestError)) return
    expect(result.status).toBe(503)
    expect(typeof result.status).toBe('number')
    expect(result.message).toContain('503')
  })

  it('returns PokeApiPayloadError for a 200 whose body is not the document it reads', async () => {
    const result = await lookup('pikachu', { malformed: ['pikachu'] })
    expect(result).toBeInstanceOf(PokeApiPayloadError)
    if (!(result instanceof PokeApiPayloadError)) return
    expect(result._tag).toBe('PokeApiPayloadError')
  })

  it('returns PokeApiUnreachableError when the request never completes', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('fetch failed')))
    const result = await fetchPokemon({ name: 'pikachu', signal })
    expect(result).toBeInstanceOf(PokeApiUnreachableError)
  })

  it('asks for the normalised name, so a typed `Pikachu` still resolves', async () => {
    const calls: string[] = []
    await lookup('Pikachu', { calls })
    expect(calls).toEqual(['https://pokeapi.co/api/v2/pokemon/pikachu'])
  })
})

describe('statValue', () => {
  it('reads the metric the roster pipeline ranks on', async () => {
    const record = await lookup('snorlax')
    if (record instanceof Error) throw record
    const raw = recordedPokemon('snorlax') as {
      stats: readonly { base_stat: number; stat: { name: string } }[]
    }
    const attack = raw.stats.find((stat) => stat.stat.name === 'attack')?.base_stat
    expect(statValue(record, 'attack')).toBe(attack)
    expect(statValue(record, 'hp')).toBeGreaterThan(0)
  })
})

describe('artworkUrlOf', () => {
  it('picks the shiny artwork when asked and the default otherwise', async () => {
    const record = await lookup('pikachu')
    if (record instanceof Error) throw record
    expect(artworkUrlOf(record, false)).toBe(record.artworkDefault)
    expect(artworkUrlOf(record, true)).toBe(record.artworkShiny)
  })

  it('falls back to the default when there is no shiny artwork', async () => {
    const record = await lookup('pikachu')
    if (record instanceof Error) throw record
    expect(artworkUrlOf({ ...record, artworkShiny: null }, true)).toBe(record.artworkDefault)
  })
})
