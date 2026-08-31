import * as errore from 'errore'
import * as z from 'zod'
import {
  POKEAPI_POKEMON_ENDPOINT,
  POKEDEX_STAT_LABELS,
  type PokedexMetric,
  type PokedexStat,
} from '../types.js'

/**
 * The one place this example talks to PokéAPI.
 *
 * Both pipelines read the same endpoint, so the request, the trimming and the four expected
 * failures live here rather than being retyped in `lookup` and `rank`. Everything that can go
 * wrong comes back as a value: `@jobik/core`'s taxonomy is frozen and says nothing about a REST
 * API, so the example declares its own tagged errors — exactly as `publication/nodes/imageOut.ts`
 * declares `ImageRenderError`.
 *
 * A handler that throws is contained by the engine, but the throw is wrapped in
 * `NodeExecutionError` and the tag is lost. Return, never throw.
 */

/**
 * The name reached the API and the API had never heard of it — a 404 with a plain-text body.
 *
 * The template variable is `$pokemon`, not `$name`: errore assigns every `$variable` as a property
 * on the instance, and `name` is one of the four it reserves (`_tag`, `name`, `stack`, `cause`)
 * because the built-in would win the assignment.
 */
export class PokemonNotFoundError extends errore.createTaggedError({
  name: 'PokemonNotFoundError',
  message: 'No pokémon named $pokemon is in the pokédex',
}) {}

/** The API answered, but not with a 200 and not with a 404. */
export class PokeApiRequestError extends errore.createTaggedError({
  name: 'PokeApiRequestError',
  message: 'PokéAPI answered $status for $pokemon',
}) {
  readonly status: number

  constructor(args: { pokemon: string; status: number; cause?: unknown }) {
    super(args)
    this.status = args.status
  }
}

/** The request never completed: DNS, TLS, a dropped socket, or the run being cancelled. */
export class PokeApiUnreachableError extends errore.createTaggedError({
  name: 'PokeApiUnreachableError',
  message: 'PokéAPI could not be reached while looking up $pokemon',
}) {}

/** A 200 whose body is not the document this flow reads. */
export class PokeApiPayloadError extends errore.createTaggedError({
  name: 'PokeApiPayloadError',
  message: 'PokéAPI returned a payload for $pokemon that this flow cannot read',
}) {}

/**
 * The slice of the PokéAPI document this example consumes, and nothing else.
 *
 * The live response is roughly 200 kB of moves, game indices and sprite variants. Declaring only
 * the read fields is what makes the recorded fixtures under `fixtures/` small enough to commit,
 * and it is what turns an unexpected shape into `PokeApiPayloadError` instead of an `undefined`
 * three property accesses later. Unknown keys are ignored: `z.object` is not strict here on
 * purpose, because the real response has hundreds of them.
 */
const pokemonPayload = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  height: z.number().int().nonnegative(),
  weight: z.number().int().nonnegative(),
  types: z
    .array(z.object({ slot: z.number().int(), type: z.object({ name: z.string().min(1) }) }))
    .min(1),
  stats: z
    .array(z.object({ base_stat: z.number().int(), stat: z.object({ name: z.string().min(1) }) }))
    .min(1),
  sprites: z.object({
    other: z.object({
      'official-artwork': z.object({
        front_default: z.url(),
        // Not every entry has been given shiny artwork, and the API says so with `null`.
        front_shiny: z.url().nullable(),
      }),
    }),
  }),
})

/** What the rest of the example sees: flat, already-ordered, already-labelled. */
export type PokemonRecord = {
  readonly number: number
  readonly apiName: string
  readonly displayName: string
  readonly primaryType: string
  /** `''` when the pokémon has a single type — a connection cannot carry "absent". */
  readonly secondaryType: string
  readonly types: readonly string[]
  readonly stats: readonly PokedexStat[]
  readonly statTotal: number
  readonly artworkDefault: string
  readonly artworkShiny: string | null
  readonly heightCm: number
  readonly weightKg: number
}

/** PokéAPI names are lowercase and hyphenated: `Mr. Mime` is `mr-mime`. */
export function normalisePokemonName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/[\s_]+/g, '-')
}

/** `mr-mime` reads as `Mr Mime` on a card; `pikachu` as `Pikachu`. */
export function displayNameOf(apiName: string): string {
  return apiName
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/**
 * Split the `roster` start's textarea into API names.
 *
 * The start takes a string rather than an array deliberately: the run panel derives a native
 * control for a string and drops to a raw JSON editor for an array, so a comma/newline separated
 * list is the control a person can actually type into. Duplicates are collapsed, order is kept.
 */
export function parseNameList(raw: string): readonly string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const part of raw.split(/[,\n;]/)) {
    const name = normalisePokemonName(part)
    if (name.length === 0 || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

/** The API's stat name shortened for display, or the raw name upper-cased when it is new. */
function statLabel(apiName: string): string {
  return Object.hasOwn(POKEDEX_STAT_LABELS, apiName)
    ? POKEDEX_STAT_LABELS[apiName as keyof typeof POKEDEX_STAT_LABELS]
    : apiName.toUpperCase()
}

/** The base value of one metric on a record, or `0` when the API did not report it. */
export function statValue(record: PokemonRecord, metric: PokedexMetric): number {
  const label = statLabel(metric)
  return record.stats.find((stat) => stat.label === label)?.base ?? 0
}

/** Turn a validated payload into the flat record the nodes pass around. */
function toRecord(payload: z.output<typeof pokemonPayload>): PokemonRecord {
  const types = [...payload.types]
    .sort((left, right) => left.slot - right.slot)
    .map((entry) => entry.type.name)
  const stats = payload.stats.map((entry) => ({
    label: statLabel(entry.stat.name),
    base: entry.base_stat,
  }))
  const artwork = payload.sprites.other['official-artwork']
  return {
    number: payload.id,
    apiName: payload.name,
    displayName: displayNameOf(payload.name),
    primaryType: types[0] ?? '',
    secondaryType: types[1] ?? '',
    types,
    stats,
    statTotal: stats.reduce((total, stat) => total + stat.base, 0),
    artworkDefault: artwork.front_default,
    artworkShiny: artwork.front_shiny,
    heightCm: payload.height * 10,
    weightKg: payload.weight / 10,
  }
}

/** The four ways `fetchPokemon` can fail, as one union for a handler to return. */
export type PokeApiError =
  | PokemonNotFoundError
  | PokeApiRequestError
  | PokeApiUnreachableError
  | PokeApiPayloadError

/**
 * One pokémon, or the reason there is not one.
 *
 * `signal` is the engine's, forwarded so that cancelling a run actually stops the request in
 * flight rather than leaving it to finish into a report nobody reads.
 */
export async function fetchPokemon(args: {
  name: string
  signal: AbortSignal
}): Promise<PokemonRecord | PokeApiError> {
  const name = normalisePokemonName(args.name)
  if (name.length === 0) {
    return new PokemonNotFoundError({ pokemon: args.name })
  }

  const response = await fetch(`${POKEAPI_POKEMON_ENDPOINT}/${encodeURIComponent(name)}`, {
    signal: args.signal,
    headers: { accept: 'application/json' },
  }).catch((cause: unknown) => new PokeApiUnreachableError({ pokemon: name, cause }))
  if (response instanceof Error) return response

  if (response.status === 404) return new PokemonNotFoundError({ pokemon: name })
  if (!response.ok) return new PokeApiRequestError({ pokemon: name, status: response.status })

  // A 200 whose body is not JSON at all rejects here rather than at `safeParse`, and it is the
  // payload that is wrong, not the network — hence the payload error on both paths. `.json()`
  // resolves to `any`, so the annotation is what keeps the union honest and the narrowing real.
  const body: unknown = await response
    .json()
    .catch((cause: unknown) => new PokeApiPayloadError({ pokemon: name, cause }))
  if (body instanceof PokeApiPayloadError) return body

  const parsed = pokemonPayload.safeParse(body)
  if (!parsed.success) return new PokeApiPayloadError({ pokemon: name, cause: parsed.error })
  return toRecord(parsed.data)
}

/** The official artwork URL for a record, honouring `shiny` and falling back when there is none. */
export function artworkUrlOf(record: PokemonRecord, shiny: boolean): string {
  return shiny ? (record.artworkShiny ?? record.artworkDefault) : record.artworkDefault
}
