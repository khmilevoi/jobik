import * as jobik from '@jobik/core'
import * as z from 'zod'
import { POKEDEX_METRICS, POKEDEX_THEMES } from '../types.js'

/**
 * The flow's two starts, attached by `index.ts` as `card` and `roster`.
 *
 * A start has an input schema and no handler: when it is selected for a run its validated input
 * becomes the start node's output fields, which is why the `card` canvas card lists `name`,
 * `shiny` and `theme` under `OUTPUTS`.
 *
 * Both schemas are deliberately FLAT SCALARS. The run panel derives a native control for a string,
 * a number, a boolean, an enum and a literal; it drops to a raw JSON editor for an object, an
 * array, a union or a record, and it fails the whole form outright for a date, a map, a set or a
 * bigint. `roster` therefore takes a comma/newline separated STRING rather than an array of names,
 * and `nodes/pokeapi.ts` splits it — a textarea a person can type into beats a JSON editor.
 */

/** Pipeline A's entrance: one pokémon, rendered as a card. */
export const pokedexCardInput = jobik.start({
  title: 'Card input',
  input: z.object({
    name: z
      .string()
      .min(1)
      .describe('A pokémon name as PokéAPI spells it — lowercase, hyphenated. Case is forgiven.')
      .meta({ title: 'Pokémon' }),
    shiny: z
      .boolean()
      .default(false)
      .describe('Fetch the shiny artwork, falling back to the ordinary one when there is none.')
      .meta({ title: 'Shiny artwork' }),
    // An enum is one of the run panel's native controls, so the theme is a segmented choice
    // rather than a free string nobody can spell right on the first try.
    theme: z
      .enum(POKEDEX_THEMES)
      .default('type')
      .describe('`type` derives the card from the primary type; the other two are fixed palettes.')
      .meta({ title: 'Card theme' }),
  }),
})

/** Pipeline B's entrance: a list of pokémon, ranked into a markdown table. */
export const pokedexRosterInput = jobik.start({
  title: 'Roster input',
  input: z.object({
    names: z
      .string()
      .min(1)
      // `multiline` is what turns a bare string into the run panel's monospace area. Without it
      // this is a single-line field and a six-name roster is unreadable while being typed.
      .meta({ multiline: true, title: 'Roster' })
      .describe('One pokémon per line, or separated by commas.'),
    metric: z
      .enum(POKEDEX_METRICS)
      .default('attack')
      .describe('Which base stat the standings are sorted on.')
      .meta({ title: 'Rank by' }),
  }),
})
