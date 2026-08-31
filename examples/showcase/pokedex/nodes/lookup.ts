import * as jobik from '@jobik/core'
import * as z from 'zod'
import { artworkUrlOf, fetchPokemon } from './pokeapi.js'

/**
 * Pipeline A's first node, attached by `index.ts` as `lookup`.
 *
 * One real request to PokéAPI, flattened into the fields the rest of the pipeline connects to.
 * `stats` stays an array because a node OUTPUT may hold one freely — only a START schema has to be
 * flat scalars, and six separate stat edges would say nothing extra on the canvas.
 *
 * `statTotal` is deliberately left unconnected: an output nothing reads is legal, and the base
 * stat total is the number a person wants in the run report even though the card recomputes it.
 */
export const lookup = jobik.node({
  title: 'Look up pokémon',
  kind: 'transform',
  input: z.object({
    name: z.string().min(1),
    shiny: z.boolean(),
  }),
  output: z.object({
    displayName: z.string(),
    number: z.number().int(),
    primaryType: z.string(),
    /** `''` when the pokémon has one type: a connection carries a value, never an absence. */
    secondaryType: z.string(),
    artworkUrl: z.url(),
    stats: z.array(z.object({ label: z.string(), base: z.number().int() })),
    statTotal: z.number().int(),
  }),
  run: async (input, context) => {
    context.log(`GET /pokemon/${input.name}`)
    const record = await fetchPokemon({ name: input.name, signal: context.signal })
    if (record instanceof Error) return record

    const artworkUrl = artworkUrlOf(record, input.shiny)
    context.log(
      `#${String(record.number).padStart(3, '0')} ${record.displayName} — ${record.types.join('/')}`,
    )
    if (input.shiny && record.artworkShiny === null) {
      context.log('no shiny artwork for this entry; using the default')
    }

    return {
      displayName: record.displayName,
      number: record.number,
      primaryType: record.primaryType,
      secondaryType: record.secondaryType,
      artworkUrl,
      stats: record.stats.map((stat) => ({ label: stat.label, base: stat.base })),
      statTotal: record.statTotal,
    }
  },
})
