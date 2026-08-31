import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'
import { buildPokedexFlow } from './index.js'
import {
  POKEDEX_CARD_START_ID,
  POKEDEX_FLOW_NAME,
  POKEDEX_ROSTER_START_ID,
  type PokedexCardStartInput,
  type PokedexRosterStartInput,
} from './types.js'

/**
 * Fixture helpers for the pokedex example.
 *
 * Node-only: this file reaches the filesystem and must never be imported by browser code — that is
 * what `types.ts` is for.
 *
 * ## Why the recordings exist
 *
 * Both pipelines call the real PokéAPI, and the repository gate has NO network. Every test in this
 * directory therefore replaces `globalThis.fetch` with `stubPokeApiFetch()`, which answers out of
 * `fixtures/` — three trimmed PokéAPI documents recorded once from the live API, and one real
 * artwork PNG downscaled to 128×128 so it is small enough to commit. The trimming is deliberate:
 * the live response is around 200 kB of moves and game indices, and `nodes/pokeapi.ts` reads about
 * a dozen fields of it.
 */

const root = path.dirname(import.meta.filename)
const recordings = path.resolve(root, 'fixtures')

export const pokedexFixture = {
  /** The example's directory. */
  root,
  /** The binding entrypoint `../jobik.config.ts` points at. Absolute. */
  bindingPath: path.resolve(root, 'index.ts'),
  /** The flow document the binding is bound to. Absolute. */
  documentPath: path.resolve(root, 'flow.jobik.json'),
  flowName: POKEDEX_FLOW_NAME,
  cardStartId: POKEDEX_CARD_START_ID,
  rosterStartId: POKEDEX_ROSTER_START_ID,
  /** Pipeline A, then pipeline B, in the order `index.ts` attaches them. */
  cardPipeline: ['card', 'lookup', 'sprite', 'compose'],
  rosterPipeline: ['roster', 'rank', 'standings'],
  nodeIds: ['card', 'lookup', 'sprite', 'compose', 'roster', 'rank', 'standings'],
} as const

/** Every pokémon `fixtures/` holds a recording for. */
export const recordedNames = ['pikachu', 'charizard', 'snorlax'] as const
export type RecordedName = (typeof recordedNames)[number]

/** The `card` start's sample input: a two-type pokémon, so both type chips are exercised. */
export const pokedexCardSampleInput: PokedexCardStartInput = {
  name: 'charizard',
  shiny: false,
  theme: 'type',
}

/** The `roster` start's sample input, including one name PokéAPI will not resolve. */
export const pokedexRosterSampleInput: PokedexRosterStartInput = {
  names: 'pikachu\ncharizard\nsnorlax',
  metric: 'attack',
}

/** One recorded PokéAPI document, as parsed JSON. */
export function recordedPokemon(name: RecordedName): unknown {
  return JSON.parse(fs.readFileSync(path.resolve(recordings, `${name}.json`), 'utf8'))
}

/** The recorded artwork: a real PNG, 128×128, downscaled from the live 475×475 official artwork. */
export function recordedArtwork(): Buffer {
  return fs.readFileSync(path.resolve(recordings, 'artwork.png'))
}

/** What a caller may bend about the stub for one test. */
export type PokeApiStubOptions = {
  /** Names answered with this body instead of the recording — for the malformed-payload path. */
  readonly malformed?: readonly string[]
  /** Names answered with this status instead of 200 or 404. */
  readonly status?: Readonly<Record<string, number>>
  /** Artwork requests reject instead of resolving — for the unreachable-artwork path. */
  readonly artworkUnreachable?: boolean
  /** Artwork requests answer 200 with these bytes — for the not-a-PNG path. */
  readonly artworkBody?: Buffer
  /** Every URL the stub was asked for, in order. Pass one in to inspect it after the run. */
  readonly calls?: string[]
}

/**
 * A `fetch` replacement that serves `fixtures/` and nothing else.
 *
 * Install it with `vi.stubGlobal('fetch', stubPokeApiFetch())`. An unrecorded pokémon answers 404
 * with a plain-text body, exactly as the live API does, so the not-found path is exercised against
 * the real response shape rather than an invented one.
 */
export function stubPokeApiFetch(options: PokeApiStubOptions = {}) {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    options.calls?.push(url)
    // A stubbed request still has to honour cancellation, or a test of the abort path would pass
    // for the wrong reason.
    if (init?.signal?.aborted === true) throw new DOMException('Aborted', 'AbortError')

    if (url.includes('/api/v2/pokemon/')) {
      const name = decodeURIComponent(url.split('/api/v2/pokemon/')[1] ?? '')
      const forced = options.status?.[name]
      if (forced !== undefined) {
        return new Response('Server Error', { status: forced })
      }
      if (options.malformed?.includes(name) === true) {
        return Response.json({ id: 25, name, sprites: {} })
      }
      if (!(recordedNames as readonly string[]).includes(name)) {
        return new Response('Not Found', { status: 404 })
      }
      return Response.json(recordedPokemon(name as RecordedName))
    }

    if (url.includes('official-artwork')) {
      if (options.artworkUnreachable === true) throw new TypeError('fetch failed')
      const body = options.artworkBody ?? recordedArtwork()
      // `Buffer` is not a `BodyInit` under the DOM lib this package compiles against; a copy into
      // a plain `Uint8Array` is, and the bytes are identical.
      return new Response(new Uint8Array(body), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    }

    return new Response('Not Found', { status: 404 })
  }
}

/** The same graph bound to another document. `documentPath` must be absolute. */
export function bindPokedexTo(documentPath: string) {
  return buildPokedexFlow().bind('path', documentPath)
}

/**
 * Copy `flow.jobik.json` into a fresh temp directory, so a save, a revision conflict or a
 * migration test can rewrite it without touching the committed example.
 */
export async function createPokedexDocumentCopy(): Promise<{
  documentPath: string
  directory: string
  cleanup: () => Promise<void>
}> {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'jobik-pokedex-'))
  const documentPath = path.resolve(directory, 'flow.jobik.json')
  try {
    await fsp.copyFile(pokedexFixture.documentPath, documentPath)
  } catch (error) {
    await fsp.rm(directory, { recursive: true, force: true })
    throw error
  }
  return {
    documentPath,
    directory,
    cleanup: () => fsp.rm(directory, { recursive: true, force: true }),
  }
}
