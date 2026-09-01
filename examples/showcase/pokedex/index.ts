import path from 'node:path'
import * as jobik from '@jobik/core'
import { compose } from './nodes/compose.js'
import { lookup } from './nodes/lookup.js'
import { rank } from './nodes/rank.js'
import { sprite } from './nodes/sprite.js'
import { standings } from './nodes/standings.js'
import { pokedexCardInput, pokedexRosterInput } from './nodes/start.js'

/**
 * The `pokedex` flow binding entrypoint.
 *
 * The named export is for application code; the default export is what `discoverFlows` reads. The
 * builder assigns the only id each definition ever has — `card`, `lookup`, `sprite`, `compose`,
 * `roster`, `rank` and `standings` are the ids the canvas, the JSON document, the run report and
 * `run()` all use.
 *
 * ## Two starts are two pipelines
 *
 * `resolveRunGraph` narrows a run to the nodes forward-reachable from the ONE start that was
 * selected, then drops any of those whose dependencies did not survive the same narrowing — so a
 * node fed by both starts belongs to no run at all and simply never executes. So a flow with two
 * starts is two INDEPENDENT pipelines that happen to share a document and a canvas — never two
 * doors into one pipeline.
 *
 * ```
 *   card ──▶ lookup ──▶ sprite ──▶ compose        renders a PNG with jimp
 *   roster ─▶ rank ──▶ standings                  renders a markdown table
 * ```
 *
 * The two halves share no node, and the graph validator would happily accept it if they did — the
 * damage would only show up at run time, as skipped nodes. If you extend this flow, extend one
 * half; do not join them.
 */

const documentPath = path.resolve(path.dirname(import.meta.filename), 'flow.jobik.json')

/** The unbound graph. `fixtures.ts` uses it to bind a copy of the document in a temp directory. */
export function buildPokedexFlow() {
  return jobik
    .flow('pokedex')
    .start('card', pokedexCardInput)
    .node('lookup', lookup)
    .node('sprite', sprite)
    .node('compose', compose)
    .start('roster', pokedexRosterInput)
    .node('rank', rank)
    .node('standings', standings)
}

export const pokedex = buildPokedexFlow().bind('path', documentPath)

export default pokedex
