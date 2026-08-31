import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubPokeApiFetch } from '../fixtures.js'
import { rank } from './rank.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

function context() {
  const logs: string[] = []
  return { logs, ctx: { signal: new AbortController().signal, log: (m: string) => logs.push(m) } }
}

describe('rank', () => {
  it('takes the roster string and the metric the start offers', () => {
    expect(rank.kind).toBe('transform')
    expect(Object.keys(rank.input.shape)).toEqual(['names', 'metric'])
    expect(Object.keys(rank.output.shape)).toEqual([
      'requested',
      'ranked',
      'leader',
      'leaderValue',
      'entries',
      'missing',
    ])
  })

  it('fetches each name in turn and ranks what came back', async () => {
    vi.stubGlobal('fetch', stubPokeApiFetch())
    const { ctx } = context()
    const result = await rank.run({ names: 'pikachu, charizard, snorlax', metric: 'attack' }, ctx)
    if (result instanceof Error) throw result
    expect(result.requested).toBe(3)
    expect(result.ranked).toBe(3)
    expect(result.entries.map((entry) => entry.name)).toEqual(['Snorlax', 'Charizard', 'Pikachu'])
    expect(result.leader).toBe('Snorlax')
    expect(result.leaderValue).toBe(result.entries[0]?.value)
    expect(result.missing).toEqual([])
    expect(rank.output.safeParse(result).success).toBe(true)
  })

  it('ranks on the metric it was given, not always on attack', async () => {
    vi.stubGlobal('fetch', stubPokeApiFetch())
    const { ctx } = context()
    const result = await rank.run({ names: 'pikachu,charizard,snorlax', metric: 'speed' }, ctx)
    if (result instanceof Error) throw result
    // Snorlax out-punches both on attack and is last on speed, so this cannot pass by accident.
    expect(result.entries.map((entry) => entry.name)).toEqual(['Charizard', 'Pikachu', 'Snorlax'])
  })

  it('logs one line per name, so the run panel Log section is worth watching', async () => {
    vi.stubGlobal('fetch', stubPokeApiFetch())
    const { ctx, logs } = context()
    await rank.run({ names: 'pikachu\ncharizard', metric: 'attack' }, ctx)
    expect(logs[0]).toBe('2 name(s) to rank by attack')
    expect(logs[1]).toContain('1/2 Pikachu:')
    expect(logs[2]).toContain('2/2 Charizard:')
    expect(logs.at(-1)).toContain('leader Charizard')
  })

  it('keeps going past a name PokéAPI does not know, and reports it as missing', async () => {
    vi.stubGlobal('fetch', stubPokeApiFetch())
    const { ctx, logs } = context()
    const result = await rank.run({ names: 'pikachu, mudkipz, snorlax', metric: 'attack' }, ctx)
    if (result instanceof Error) throw result
    expect(result.requested).toBe(3)
    expect(result.ranked).toBe(2)
    expect(result.missing).toEqual(['mudkipz'])
    expect(result.entries.map((entry) => entry.name)).toEqual(['Snorlax', 'Pikachu'])
    expect(logs.some((line) => line.includes('mudkipz') && line.includes('pokédex'))).toBe(true)
  })

  it('settles with an empty leader rather than failing when nothing resolves', async () => {
    vi.stubGlobal('fetch', stubPokeApiFetch())
    const { ctx } = context()
    const result = await rank.run({ names: 'mudkipz, missingno', metric: 'hp' }, ctx)
    if (result instanceof Error) throw result
    expect(result.ranked).toBe(0)
    expect(result.leader).toBe('')
    expect(result.leaderValue).toBe(0)
    expect(result.missing).toEqual(['mudkipz', 'missingno'])
  })

  it('collapses a duplicated name into one request', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', stubPokeApiFetch({ calls }))
    const { ctx } = context()
    const result = await rank.run({ names: 'pikachu, Pikachu, PIKACHU', metric: 'attack' }, ctx)
    if (result instanceof Error) throw result
    expect(calls).toHaveLength(1)
    expect(result.requested).toBe(1)
  })
})
