import { compose } from './compose.js'
import { lookup } from './lookup.js'
import { rank } from './rank.js'
import { sprite } from './sprite.js'
import { standings } from './standings.js'
import { pokedexCardInput, pokedexRosterInput } from './start.js'

export type { CardSubject } from './cardArt.js'
export { captionFor, mix, paletteFor, pokedexNumber, renderCard } from './cardArt.js'
export { CardRenderError, compose } from './compose.js'
export { lookup } from './lookup.js'
export type { PokeApiError, PokemonRecord } from './pokeapi.js'
export {
  artworkUrlOf,
  displayNameOf,
  fetchPokemon,
  normalisePokemonName,
  PokeApiPayloadError,
  PokeApiRequestError,
  PokeApiUnreachableError,
  PokemonNotFoundError,
  parseNameList,
  statValue,
} from './pokeapi.js'
export { rank } from './rank.js'
export {
  ArtworkFetchError,
  ArtworkFormatError,
  ArtworkUnreachableError,
  sprite,
} from './sprite.js'
export { standings } from './standings.js'
export type { RosterRow } from './standingsTable.js'
export {
  metricLabel,
  rankRoster,
  standingsSummary,
  standingsTable,
} from './standingsTable.js'
export { pokedexCardInput, pokedexRosterInput } from './start.js'

/**
 * The `Inventory` group of the left sidebar: this flow's definitions with the label the design
 * prints to their right. Documentation for a reader of the source — the live sidebar derives
 * Inventory from each `definition.title` server-side, not from this array.
 *
 * Two `start<T>` rows, because this flow has two starts and they are two separate pipelines. Every
 * definition listed here IS attached; unlike `publication`, nothing is authored-but-unused.
 */
export const pokedexInventory = [
  { name: 'start<T>', label: 'entry', definition: pokedexCardInput },
  { name: 'lookup', label: 'transform', definition: lookup },
  { name: 'sprite', label: 'fetcher', definition: sprite },
  { name: 'compose', label: 'renderer', definition: compose },
  { name: 'start<T>', label: 'entry', definition: pokedexRosterInput },
  { name: 'rank', label: 'transform', definition: rank },
  { name: 'standings', label: 'sink', definition: standings },
] as const
