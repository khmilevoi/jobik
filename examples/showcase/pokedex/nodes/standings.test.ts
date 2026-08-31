import { describe, expect, it } from 'vitest'
import { standings } from './standings.js'

const context = { signal: new AbortController().signal, log: () => {} }

/** The handler's own parameter type, so the fixture cannot drift from the schema. */
type StandingsInput = Parameters<typeof standings.run>[0]

const input: StandingsInput = {
  metric: 'attack',
  entries: [
    { rank: 1, name: 'Snorlax', number: 143, types: 'normal', value: 110, total: 540 },
    { rank: 2, name: 'Charizard', number: 6, types: 'fire / flying', value: 84, total: 534 },
  ],
  missing: ['mudkipz'],
  leader: 'Snorlax',
  leaderValue: 110,
}

describe('standings', () => {
  it('is the pipeline`s sink and takes the metric from the start, not from rank', () => {
    expect(standings.kind).toBe('sink')
    expect(Object.keys(standings.input.shape)).toEqual([
      'metric',
      'entries',
      'missing',
      'leader',
      'leaderValue',
    ])
    expect(Object.keys(standings.output.shape)).toEqual(['table', 'summary', 'ranked'])
  })

  it('is pure: the same input always produces the same markdown', async () => {
    const first = await standings.run({ ...input }, context)
    const second = await standings.run({ ...input }, context)
    expect(first).toEqual(second)
  })

  it('emits the table and the summary the generic viewer renders', async () => {
    const result = await standings.run({ ...input }, context)
    if (result instanceof Error) throw result
    expect(result.table.split('\n')[0]).toBe('| # | Pokémon | No. | Types | ATK | BST |')
    expect(result.table).toContain('| 1 | Snorlax | #143 | normal | 110 | 540 |')
    expect(result.summary).toContain('Snorlax leads 2 pokémon on ATK with 110')
    expect(result.summary).toContain('mudkipz')
    expect(result.ranked).toBe(2)
    expect(standings.output.safeParse(result).success).toBe(true)
  })

  it('produces a readable output for an empty roster rather than a broken table', async () => {
    const result = await standings.run(
      { ...input, entries: [], missing: [], leader: '', leaderValue: 0 },
      context,
    )
    if (result instanceof Error) throw result
    expect(result.table).toBe('_No pokémon in this roster resolved._')
    expect(result.ranked).toBe(0)
  })
})
