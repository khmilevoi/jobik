import { describe, expect, it } from 'vitest'
import {
  metricLabel,
  type RosterRow,
  rankRoster,
  standingsSummary,
  standingsTable,
} from './standingsTable.js'

/** No network, no jimp: the ranking and the markdown are ordinary functions and are tested so. */

const row = (name: string, number: number, value: number, total: number): RosterRow => ({
  name,
  number,
  types: ['normal'],
  stats: [{ label: 'ATK', base: value }],
  value,
  total,
})

describe('metricLabel', () => {
  it('uses the same short label the card prints', () => {
    expect(metricLabel('attack')).toBe('ATK')
    expect(metricLabel('defense')).toBe('DEF')
    expect(metricLabel('speed')).toBe('SPD')
    expect(metricLabel('hp')).toBe('HP')
  })
})

describe('rankRoster', () => {
  it('sorts by the metric, highest first, and numbers the result', () => {
    const entries = rankRoster([
      row('Pikachu', 25, 55, 320),
      row('Snorlax', 143, 110, 540),
      row('Charizard', 6, 84, 534),
    ])
    expect(entries.map((entry) => entry.name)).toEqual(['Snorlax', 'Charizard', 'Pikachu'])
    expect(entries.map((entry) => entry.rank)).toEqual([1, 2, 3])
  })

  it('breaks a tie by name, so the table is stable however the requests settled', () => {
    const forwards = rankRoster([row('Zubat', 41, 45, 245), row('Abra', 63, 45, 310)])
    const backwards = rankRoster([row('Abra', 63, 45, 310), row('Zubat', 41, 45, 245)])
    expect(forwards.map((entry) => entry.name)).toEqual(['Abra', 'Zubat'])
    expect(backwards).toEqual(forwards)
  })

  it('joins the types into the one string the table cell holds', () => {
    const [entry] = rankRoster([{ ...row('Charizard', 6, 84, 534), types: ['fire', 'flying'] }])
    expect(entry?.types).toBe('fire / flying')
  })

  it('is empty for an empty roster', () => {
    expect(rankRoster([])).toEqual([])
  })
})

describe('standingsTable', () => {
  it('renders a GitHub-flavoured table headed by the metric', () => {
    const entries = rankRoster([row('Snorlax', 143, 110, 540), row('Pikachu', 25, 55, 320)])
    expect(standingsTable({ entries, metric: 'attack' }).split('\n')).toEqual([
      '| # | Pokémon | No. | Types | ATK | BST |',
      '| ---: | --- | ---: | --- | ---: | ---: |',
      '| 1 | Snorlax | #143 | normal | 110 | 540 |',
      '| 2 | Pikachu | #025 | normal | 55 | 320 |',
    ])
  })

  it('escapes a pipe so a cell cannot break the table', () => {
    const entries = rankRoster([{ ...row('Ho|Oh', 250, 130, 680), types: ['fire|flying'] }])
    const table = standingsTable({ entries, metric: 'attack' })
    expect(table).toContain('Ho\\|Oh')
    expect(table).toContain('fire\\|flying')
  })

  it('says so instead of printing a headless table for an empty roster', () => {
    expect(standingsTable({ entries: [], metric: 'speed' })).toBe(
      '_No pokémon in this roster resolved._',
    )
  })
})

describe('standingsSummary', () => {
  const entries = rankRoster([row('Snorlax', 143, 110, 540), row('Pikachu', 25, 55, 320)])

  it('names the leader and the margin over the runner-up', () => {
    expect(
      standingsSummary({
        entries,
        missing: [],
        metric: 'attack',
        leader: 'Snorlax',
        leaderValue: 110,
      }),
    ).toBe('Snorlax leads 2 pokémon on ATK with 110 — 55 ahead of Pikachu.')
  })

  it('drops the margin when the leader is alone', () => {
    const summary = standingsSummary({
      entries: entries.slice(0, 1),
      missing: [],
      metric: 'hp',
      leader: 'Snorlax',
      leaderValue: 110,
    })
    expect(summary).toBe('Snorlax leads 1 pokémon on HP with 110.')
  })

  it('reports the names that never resolved', () => {
    const summary = standingsSummary({
      entries,
      missing: ['mudkipz', 'missingno'],
      metric: 'attack',
      leader: 'Snorlax',
      leaderValue: 110,
    })
    expect(summary).toContain('2 name(s) did not resolve: mudkipz, missingno.')
  })

  it('has something to say when nothing resolved at all', () => {
    expect(
      standingsSummary({
        entries: [],
        missing: ['mudkipz'],
        metric: 'defense',
        leader: '',
        leaderValue: 0,
      }),
    ).toBe(
      'No pokémon resolved, so there is nothing to rank by DEF. 1 name(s) did not resolve: mudkipz.',
    )
  })
})
