import type { AssetDescriptor } from '@jobik/core'

/**
 * Browser-safe shared types and constants for the pokedex example.
 *
 * `flow.ui.tsx` and `components/` import only from this file. Nothing here may import a handler, a
 * `node:` builtin, or `./nodes/` — the extension bundler pulls this module into the browser.
 */

/** The flow name the builder assigns, shown in the top bar and the `Flows` list. */
export const POKEDEX_FLOW_NAME = 'pokedex'

/**
 * The two starts, and the reason this example exists.
 *
 * A run is narrowed to the nodes forward-reachable from ONE selected start, and a node whose
 * dependency sits outside that subgraph is settled `skipped`. Two starts are therefore two
 * INDEPENDENT pipelines sharing a document and a canvas, never two entrances to one pipeline:
 * `card` reaches `lookup → sprite → compose`, `roster` reaches `rank → standings`, and no node is
 * reachable from both.
 */
export const POKEDEX_CARD_START_ID = 'card'
export const POKEDEX_ROSTER_START_ID = 'roster'

/** Every id the flow builder assigns, in the order `index.ts` attaches them. */
export type PokedexNodeId =
  | 'card'
  | 'lookup'
  | 'sprite'
  | 'compose'
  | 'roster'
  | 'rank'
  | 'standings'

/** The free, key-less API both pipelines read. Names are lowercase and hyphenated. */
export const POKEAPI_POKEMON_ENDPOINT = 'https://pokeapi.co/api/v2/pokemon'

/** The card `compose` rasterises, and the mime `jobik.asset()` is declared with. */
export const POKEDEX_CARD_WIDTH = 720
export const POKEDEX_CARD_HEIGHT = 420
export const POKEDEX_CARD_MIME = 'image/png'
export const POKEDEX_CARD_ASSET_NAME = 'card.png'

/** Official artwork is a 475×475 PNG; `sprite` downloads it untouched. */
export const POKEDEX_ARTWORK_MIME = 'image/png'
export const POKEDEX_ARTWORK_ASSET_NAME = 'artwork.png'

/** How the `card` start lets a caller restyle the rendered card. */
export const POKEDEX_THEMES = ['type', 'midnight', 'parchment'] as const
export type PokedexTheme = (typeof POKEDEX_THEMES)[number]

/** Which base stat the `roster` pipeline ranks on. */
export const POKEDEX_METRICS = ['attack', 'defense', 'speed', 'hp'] as const
export type PokedexMetric = (typeof POKEDEX_METRICS)[number]

/**
 * The six base stats PokéAPI returns, in its own order, with the short label the card prints and
 * the markdown table heads. Keyed by the API's `stat.name`.
 */
export const POKEDEX_STAT_LABELS = {
  hp: 'HP',
  attack: 'ATK',
  defense: 'DEF',
  'special-attack': 'SP.ATK',
  'special-defense': 'SP.DEF',
  speed: 'SPD',
} as const satisfies Record<string, string>

/** Blissey's 255 HP is the highest base stat in the games, so the stat bars scale against it. */
export const POKEDEX_MAX_BASE_STAT = 255

/**
 * The eighteen type colours, as the games use them.
 *
 * These are the flow's own domain data, not Studio chrome: the rasteriser converts them to jimp
 * RGBA and the output component paints one swatch with the primary type. The Studio's `--jbk-*`
 * tokens stay the source of every colour the *editor* draws — nothing here reaches a stylesheet.
 */
export const POKEDEX_TYPE_COLOURS = {
  normal: '#a8a77a',
  fire: '#ee8130',
  water: '#6390f0',
  electric: '#f7d02c',
  grass: '#7ac74c',
  ice: '#96d9d6',
  fighting: '#c22e28',
  poison: '#a33ea1',
  ground: '#e2bf65',
  flying: '#a98ff3',
  psychic: '#f95587',
  bug: '#a6b91a',
  rock: '#b6a136',
  ghost: '#735797',
  dragon: '#6f35fc',
  dark: '#705746',
  steel: '#b7b7ce',
  fairy: '#d685ad',
} as const satisfies Record<string, string>

/** The colour a type this map does not know falls back to. */
export const POKEDEX_UNKNOWN_TYPE_COLOUR = '#6b7280'

/** The colour for one type name, case-insensitively, or the fallback. */
export function typeColour(name: string): string {
  const key = name.trim().toLowerCase()
  return Object.hasOwn(POKEDEX_TYPE_COLOURS, key)
    ? POKEDEX_TYPE_COLOURS[key as keyof typeof POKEDEX_TYPE_COLOURS]
    : POKEDEX_UNKNOWN_TYPE_COLOUR
}

/** One row of the stat block: the short label and the base value. */
export type PokedexStat = { readonly label: string; readonly base: number }

/** One ranked pokémon in the `roster` pipeline. */
export type PokedexStanding = {
  readonly rank: number
  readonly name: string
  readonly number: number
  readonly types: string
  readonly value: number
  readonly total: number
}

/** What a caller hands `run('card', input)`. */
export type PokedexCardStartInput = {
  readonly name: string
  readonly shiny: boolean
  readonly theme: PokedexTheme
}

/** What a caller hands `run('roster', input)`. */
export type PokedexRosterStartInput = {
  readonly names: string
  readonly metric: PokedexMetric
}

/**
 * `compose`'s output as the browser sees it: the server replaces the in-process `Buffer` with an
 * `AssetDescriptor` as the report crosses the wire. In process the field is a `Buffer`.
 */
export type PokedexComposeOutputWire = {
  readonly image: AssetDescriptor
  readonly caption: string
  readonly primaryType: string
  readonly secondaryType: string
}

/** `standings`' output. Pipeline B registers no component, so the generic viewer renders this. */
export type PokedexStandingsOutput = {
  readonly table: string
  readonly summary: string
}
