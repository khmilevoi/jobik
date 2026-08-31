import * as fs from 'node:fs'
import { Jimp } from 'jimp'
import { describe, expect, it } from 'vitest'
import {
  createPokedexDocumentCopy,
  pokedexCardSampleInput,
  pokedexFixture,
  pokedexRosterSampleInput,
  recordedArtwork,
  recordedNames,
  recordedPokemon,
  stubPokeApiFetch,
} from './fixtures.js'
import { pokedex } from './index.js'

describe('pokedexFixture', () => {
  it('points at the files the Studio config names', () => {
    expect(fs.existsSync(pokedexFixture.bindingPath)).toBe(true)
    expect(pokedexFixture.documentPath).toBe(pokedex.path)
    expect(pokedexFixture.flowName).toBe(pokedex.name)
  })

  it('splits the node ids into the two pipelines and nothing is left over', () => {
    expect([...pokedexFixture.cardPipeline, ...pokedexFixture.rosterPipeline]).toEqual(
      pokedexFixture.nodeIds,
    )
    expect([...pokedexFixture.nodeIds].sort()).toEqual(Object.keys(pokedex.nodes).sort())
  })

  it('offers a sample input each start accepts', () => {
    expect(pokedex.nodes.card.input.safeParse(pokedexCardSampleInput).success).toBe(true)
    expect(pokedex.nodes.roster.input.safeParse(pokedexRosterSampleInput).success).toBe(true)
  })
})

describe('the recordings', () => {
  it('holds a trimmed PokéAPI document for each recorded name', () => {
    for (const name of recordedNames) {
      const payload = recordedPokemon(name) as { name: string; stats: readonly unknown[] }
      expect(payload.name).toBe(name)
      expect(payload.stats).toHaveLength(6)
    }
  })

  it('keeps them small, which is the whole point of trimming the response', () => {
    for (const name of recordedNames) {
      const size = JSON.stringify(recordedPokemon(name)).length
      expect(size).toBeLessThan(4096)
    }
  })

  it('holds a real 128×128 PNG for the artwork', async () => {
    const png = recordedArtwork()
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
    const decoded = await Jimp.read(png)
    expect(decoded.bitmap.width).toBe(128)
    expect(decoded.bitmap.height).toBe(128)
  })
})

describe('stubPokeApiFetch', () => {
  it('answers a recorded name with the recording', async () => {
    const response = await stubPokeApiFetch()('https://pokeapi.co/api/v2/pokemon/pikachu')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(recordedPokemon('pikachu'))
  })

  it('answers an unrecorded name the way the live API does — 404, plain text', async () => {
    const response = await stubPokeApiFetch()('https://pokeapi.co/api/v2/pokemon/mudkipz')
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not Found')
  })

  it('serves the artwork bytes for an official-artwork URL', async () => {
    const response = await stubPokeApiFetch()(
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png',
    )
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(Buffer.from(await response.arrayBuffer()).equals(recordedArtwork())).toBe(true)
  })

  it('records every URL it was asked for when a caller wants to see them', async () => {
    const calls: string[] = []
    const fetchStub = stubPokeApiFetch({ calls })
    await fetchStub('https://pokeapi.co/api/v2/pokemon/snorlax')
    await fetchStub(new URL('https://pokeapi.co/api/v2/pokemon/pikachu'))
    expect(calls).toEqual([
      'https://pokeapi.co/api/v2/pokemon/snorlax',
      'https://pokeapi.co/api/v2/pokemon/pikachu',
    ])
  })

  it('honours an already-aborted signal, so a cancellation test cannot pass by accident', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      stubPokeApiFetch()('https://pokeapi.co/api/v2/pokemon/pikachu', {
        signal: controller.signal,
      }),
    ).rejects.toThrow()
  })
})

describe('createPokedexDocumentCopy', () => {
  it('copies the document somewhere a test may rewrite it', async () => {
    const copy = await createPokedexDocumentCopy()
    try {
      expect(fs.readFileSync(copy.documentPath, 'utf8')).toBe(
        fs.readFileSync(pokedexFixture.documentPath, 'utf8'),
      )
      expect(copy.documentPath).not.toBe(pokedexFixture.documentPath)
    } finally {
      await copy.cleanup()
    }
    expect(fs.existsSync(copy.directory)).toBe(false)
  })
})
