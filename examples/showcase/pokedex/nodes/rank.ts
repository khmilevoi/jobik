import * as jobik from '@jobik/core'
import * as z from 'zod'
import { POKEDEX_METRICS } from '../types.js'
import { fetchPokemon, parseNameList, statValue } from './pokeapi.js'
import { type RosterRow, rankRoster } from './standingsTable.js'

/**
 * Pipeline B's first node, attached by `index.ts` as `rank`.
 *
 * One request per name, in turn, with a `context.log` line for each — this is the node that makes
 * the run panel's `Log` section worth watching, and the reason the roster is a list rather than a
 * single lookup. Sequential on purpose: PokéAPI is free and unauthenticated, and a showcase should
 * not teach a reader to fan twenty parallel requests at it.
 *
 * A name that does not resolve is NOT a failure. It lands in `missing` and the run carries on, so
 * the standings still come out; the four tagged errors from `nodes/pokeapi.ts` are recorded in the
 * log rather than returned. Pipeline A takes the opposite view, because a card of nothing is not a
 * card — the two halves of this flow demonstrate both policies.
 */
export const rank = jobik.node({
  title: 'Rank roster',
  kind: 'transform',
  input: z.object({
    names: z.string().min(1),
    metric: z.enum(POKEDEX_METRICS),
  }),
  output: z.object({
    requested: z.number().int(),
    ranked: z.number().int(),
    leader: z.string(),
    leaderValue: z.number().int(),
    entries: z.array(
      z.object({
        rank: z.number().int(),
        name: z.string(),
        number: z.number().int(),
        types: z.string(),
        value: z.number().int(),
        total: z.number().int(),
      }),
    ),
    missing: z.array(z.string()),
  }),
  run: async (input, context) => {
    const names = parseNameList(input.names)
    context.log(`${names.length} name(s) to rank by ${input.metric}`)

    const rows: RosterRow[] = []
    const missing: string[] = []
    for (const [index, name] of names.entries()) {
      const position = `${index + 1}/${names.length}`
      const record = await fetchPokemon({ name, signal: context.signal })
      if (record instanceof Error) {
        context.log(`${position} ${name}: ${record.message}`)
        missing.push(name)
        continue
      }
      const value = statValue(record, input.metric)
      context.log(
        `${position} ${record.displayName}: ${input.metric} ${value}, ${record.statTotal} BST`,
      )
      rows.push({
        name: record.displayName,
        number: record.number,
        types: record.types,
        stats: record.stats,
        value,
        total: record.statTotal,
      })
    }

    const entries = rankRoster(rows)
    const leader = entries[0]
    context.log(
      leader === undefined
        ? 'nothing resolved'
        : `leader ${leader.name} with ${input.metric} ${leader.value}`,
    )

    return {
      requested: names.length,
      ranked: entries.length,
      leader: leader?.name ?? '',
      leaderValue: leader?.value ?? 0,
      // `rankRoster` returns a `readonly` array, which zod's inferred input type will not take.
      entries: [...entries],
      missing,
    }
  },
})
