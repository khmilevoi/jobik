import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubPokeApiFetch } from '../fixtures.js'
import { lookup } from './lookup.js'
import { PokeApiRequestError, PokemonNotFoundError } from './pokeapi.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

function context() {
  const logs: string[] = []
  return { logs, ctx: { signal: new AbortController().signal, log: (m: string) => logs.push(m) } }
}

describe('lookup', () => {
  it('is a transform with the two inputs the card start feeds it', () => {
    expect(lookup.kind).toBe('transform')
    expect(lookup.title).toBe('Look up pokémon')
    expect(Object.keys(lookup.input.shape)).toEqual(['name', 'shiny'])
    expect(Object.keys(lookup.output.shape)).toEqual([
      'displayName',
      'number',
      'primaryType',
      'secondaryType',
      'artworkUrl',
      'stats',
      'statTotal',
    ])
  })

  it('flattens a two-type pokémon into the fields compose connects to', async () => {
    vi.stubGlobal('fetch', stubPokeApiFetch())
    const { ctx } = context()
    const result = await lookup.run({ name: 'charizard', shiny: false }, ctx)
    if (result instanceof Error) throw result
    expect(result.displayName).toBe('Charizard')
    expect(result.number).toBe(6)
    expect(result.primaryType).toBe('fire')
    expect(result.secondaryType).toBe('flying')
    expect(result.stats).toHaveLength(6)
    expect(result.statTotal).toBe(result.stats.reduce((sum, stat) => sum + stat.base, 0))
    expect(lookup.output.safeParse(result).success).toBe(true)
  })

  it('leaves secondaryType empty for a single-type pokémon', async () => {
    vi.stubGlobal('fetch', stubPokeApiFetch())
    const { ctx } = context()
    const result = await lookup.run({ name: 'pikachu', shiny: false }, ctx)
    if (result instanceof Error) throw result
    expect(result.secondaryType).toBe('')
  })

  it('selects the shiny artwork when the start asked for it', async () => {
    vi.stubGlobal('fetch', stubPokeApiFetch())
    const { ctx } = context()
    const plain = await lookup.run({ name: 'pikachu', shiny: false }, ctx)
    const shiny = await lookup.run({ name: 'pikachu', shiny: true }, ctx)
    if (plain instanceof Error || shiny instanceof Error) throw plain
    expect(plain.artworkUrl).not.toBe(shiny.artworkUrl)
    expect(shiny.artworkUrl).toContain('/shiny/')
  })

  it('logs the request and what came back, so the run log reads as a lookup', async () => {
    vi.stubGlobal('fetch', stubPokeApiFetch())
    const { ctx, logs } = context()
    await lookup.run({ name: 'charizard', shiny: false }, ctx)
    expect(logs[0]).toBe('GET /pokemon/charizard')
    expect(logs[1]).toBe('#006 Charizard — fire/flying')
  })

  it('returns the tagged not-found error rather than throwing it', async () => {
    vi.stubGlobal('fetch', stubPokeApiFetch())
    const { ctx } = context()
    const result = await lookup.run({ name: 'missingno', shiny: false }, ctx)
    expect(result).toBeInstanceOf(PokemonNotFoundError)
  })

  it('passes a non-404 failure through with its status intact', async () => {
    vi.stubGlobal('fetch', stubPokeApiFetch({ status: { pikachu: 500 } }))
    const { ctx } = context()
    const result = await lookup.run({ name: 'pikachu', shiny: false }, ctx)
    expect(result).toBeInstanceOf(PokeApiRequestError)
    if (!(result instanceof PokeApiRequestError)) return
    expect(result.status).toBe(500)
  })
})
