import {
  POKEDEX_STAT_LABELS,
  type PokedexMetric,
  type PokedexStanding,
  type PokedexStat,
} from '../types.js'

/**
 * The ranking and the markdown, with no network and no jimp anywhere near them.
 *
 * `rank` does the fetching and `standings` does the formatting, but the decisions both make —
 * how a tie is broken, how a column is aligned, what an empty roster prints — are ordinary pure
 * functions, so they are tested directly rather than through a stubbed `fetch`.
 */

/** One fetched pokémon, before it has a rank. */
export type RosterRow = {
  readonly name: string
  readonly number: number
  readonly types: readonly string[]
  readonly stats: readonly PokedexStat[]
  readonly value: number
  readonly total: number
}

/** The metric's column head: `attack` prints as `ATK`, matching the card's stat block. */
export function metricLabel(metric: PokedexMetric): string {
  return POKEDEX_STAT_LABELS[metric]
}

/**
 * Sort by the metric, highest first, and number the result.
 *
 * Ties are broken by display name so the standings are stable across runs — the API returns a
 * roster in whatever order the requests settled, and an unstable table is a table nobody trusts.
 * Numbering is ordinal (1, 2, 3), not competition ranking: a shared value is still two rows.
 */
export function rankRoster(rows: readonly RosterRow[]): readonly PokedexStanding[] {
  return [...rows]
    .sort((left, right) =>
      right.value === left.value ? left.name.localeCompare(right.name) : right.value - left.value,
    )
    .map((row, index) => ({
      rank: index + 1,
      name: row.name,
      number: row.number,
      types: row.types.join(' / '),
      value: row.value,
      total: row.total,
    }))
}

/** `|` is the cell separator, so it cannot survive inside a cell. */
function cell(value: string): string {
  return value.replace(/\|/g, '\\|')
}

/** `#025`, matching the card. */
function numbered(value: number): string {
  return `#${String(value).padStart(3, '0')}`
}

/**
 * The standings as a GitHub-flavoured markdown table.
 *
 * An empty roster gets a sentence rather than a headless table: `standings` is a sink and its
 * output is read by a person, so "nothing resolved" has to say so.
 */
export function standingsTable(args: {
  entries: readonly PokedexStanding[]
  metric: PokedexMetric
}): string {
  if (args.entries.length === 0) return '_No pokémon in this roster resolved._'
  const head = `| # | Pokémon | No. | Types | ${metricLabel(args.metric)} | BST |`
  const rule = '| ---: | --- | ---: | --- | ---: | ---: |'
  const rows = args.entries.map(
    (entry) =>
      `| ${entry.rank} | ${cell(entry.name)} | ${numbered(entry.number)} | ${cell(entry.types)} | ${entry.value} | ${entry.total} |`,
  )
  return [head, rule, ...rows].join('\n')
}

/** One sentence over the table: who won, by how much, and what never resolved. */
export function standingsSummary(args: {
  entries: readonly PokedexStanding[]
  missing: readonly string[]
  metric: PokedexMetric
  leader: string
  leaderValue: number
}): string {
  const missingNote =
    args.missing.length === 0
      ? ''
      : ` ${args.missing.length} name(s) did not resolve: ${args.missing.join(', ')}.`
  if (args.entries.length === 0) {
    return `No pokémon resolved, so there is nothing to rank by ${metricLabel(args.metric)}.${missingNote}`
  }
  const runnerUp = args.entries[1]
  const margin =
    runnerUp === undefined
      ? ''
      : ` — ${args.leaderValue - runnerUp.value} ahead of ${runnerUp.name}`
  return `${args.leader} leads ${args.entries.length} pokémon on ${metricLabel(args.metric)} with ${args.leaderValue}${margin}.${missingNote}`
}
