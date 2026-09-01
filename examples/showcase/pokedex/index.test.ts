import * as path from 'node:path'
import { readFlowDocument, resolveRunGraph, validateFlowGraph } from '@jobik/core'
import { describe, expect, it } from 'vitest'
import defaultExport, { buildPokedexFlow, pokedex } from './index.js'
import { pokedexInventory } from './nodes/index.js'
import type { PokedexNodeId } from './types.js'

async function runGraphFor(startId: string) {
  const file = await readFlowDocument({ path: pokedex.path })
  if (file instanceof Error) throw file
  const graph = validateFlowGraph({ flow: pokedex, document: file.document })
  if (graph instanceof Error) throw graph
  const runGraph = resolveRunGraph({ graph, startId })
  if (runGraph instanceof Error) throw runGraph
  return runGraph
}

describe('pokedex binding', () => {
  it('is named after the flow the top bar shows', () => {
    expect(pokedex.name).toBe('pokedex')
  })

  it('binds to the absolute path of its own document', () => {
    expect(path.isAbsolute(pokedex.path)).toBe(true)
    expect(path.basename(pokedex.path)).toBe('flow.jobik.json')
    expect(path.dirname(pokedex.path)).toBe(path.dirname(import.meta.filename))
  })

  it('exposes the same value as the default export used for UI discovery', () => {
    expect(defaultExport).toBe(pokedex)
  })

  it('attaches the seven nodes the canvas shows, in order', () => {
    expect(Object.keys(pokedex.nodes)).toEqual([
      'card',
      'lookup',
      'sprite',
      'compose',
      'roster',
      'rank',
      'standings',
    ])
  })

  it('attaches them with the kinds the sidebar lists', () => {
    expect(pokedex.nodes.card.kind).toBe('start')
    expect(pokedex.nodes.lookup.kind).toBe('transform')
    expect(pokedex.nodes.sprite.kind).toBe('transform')
    expect(pokedex.nodes.compose.kind).toBe('transform')
    expect(pokedex.nodes.roster.kind).toBe('start')
    expect(pokedex.nodes.rank.kind).toBe('transform')
    expect(pokedex.nodes.standings.kind).toBe('sink')
  })

  it('exposes the field names the node cards show', () => {
    expect(Object.keys(pokedex.nodes.card.input.shape)).toEqual(['name', 'shiny', 'theme'])
    expect(Object.keys(pokedex.nodes.roster.input.shape)).toEqual(['names', 'metric'])
    expect(Object.keys(pokedex.nodes.compose.output.shape)).toEqual([
      'image',
      'caption',
      'primaryType',
      'secondaryType',
    ])
    expect(Object.keys(pokedex.nodes.standings.output.shape)).toEqual([
      'table',
      'summary',
      'ranked',
    ])
  })

  it('can be rebound to another absolute path without duplicating the graph', () => {
    const elsewhere = path.resolve(path.dirname(import.meta.filename), 'other.jobik.json')
    const rebound = buildPokedexFlow().bind('path', elsewhere)
    expect(rebound.path).toBe(elsewhere)
    expect(rebound.nodes.compose).toBe(pokedex.nodes.compose)
  })

  it('rejects a relative binding path', () => {
    expect(() => buildPokedexFlow().bind('path', 'flow.jobik.json')).toThrow(TypeError)
  })
})

/**
 * The invariant this whole example exists to demonstrate.
 *
 * `resolveRunGraph` narrows a run to the nodes forward-reachable from ONE start, then drops any of
 * those whose dependencies did not survive the same narrowing. A node fed by both starts is
 * therefore in neither run and never executes, with nothing said about it anywhere. Two starts are
 * only useful when they are two independent pipelines. The graph validator accepts a converging
 * graph and the loss would be silent, so the disjointness has to be asserted here.
 */
describe('the two starts are two disjoint pipelines', () => {
  it('declares exactly two starts', () => {
    const startIds = Object.entries(pokedex.nodes)
      .filter(([, definition]) => definition.kind === 'start')
      .map(([id]) => id)
    expect(startIds).toEqual(['card', 'roster'])
  })

  it('reaches only its own half from each start', async () => {
    const card = await runGraphFor('card')
    const roster = await runGraphFor('roster')
    expect(card.order).toEqual(['card', 'lookup', 'sprite', 'compose'])
    expect(roster.order).toEqual(['roster', 'rank', 'standings'])
  })

  it('shares no node between the two run graphs', async () => {
    const card = await runGraphFor('card')
    const roster = await runGraphFor('roster')
    const shared = [...card.nodes.keys()].filter((id) => roster.nodes.has(id))
    expect(shared).toEqual([])
  })

  it('covers every attached node between the two of them, so nothing is unreachable', async () => {
    const card = await runGraphFor('card')
    const roster = await runGraphFor('roster')
    const covered = [...card.nodes.keys(), ...roster.nodes.keys()].sort()
    expect(covered).toEqual(Object.keys(pokedex.nodes).sort())
  })

  it('gives every node in a run graph its dependencies inside that same run graph', async () => {
    for (const startId of ['card', 'roster']) {
      const runGraph = await runGraphFor(startId)
      for (const [nodeId, node] of runGraph.nodes) {
        for (const dependency of node.dependencies) {
          // `resolveRunGraph` now guarantees this closure, and `blockedBy` in `run/execute.ts`
          // relies on it. A converging graph loses its join node here, not at run time.
          expect(runGraph.nodes.has(dependency), `${nodeId} depends on ${dependency}`).toBe(true)
        }
      }
    }
  })
})

describe('pokedexInventory', () => {
  it('lists every definition the flow attaches, with the label the sidebar prints', () => {
    expect(pokedexInventory.map((entry) => entry.name)).toEqual([
      'start<T>',
      'lookup',
      'sprite',
      'compose',
      'start<T>',
      'rank',
      'standings',
    ])
    expect(pokedexInventory.map((entry) => entry.label)).toEqual([
      'entry',
      'transform',
      'fetcher',
      'renderer',
      'entry',
      'transform',
      'sink',
    ])
  })

  it('points at the definitions the flow actually attached, in attachment order', () => {
    const ids: readonly PokedexNodeId[] = [
      'card',
      'lookup',
      'sprite',
      'compose',
      'roster',
      'rank',
      'standings',
    ]
    ids.forEach((id, index) => {
      expect(pokedexInventory[index]?.definition).toBe(pokedex.nodes[id])
    })
  })
})
