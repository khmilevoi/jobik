import * as fs from 'node:fs/promises'
import {
  CURRENT_FLOW_VERSION,
  FLOW_DOCUMENT_FORMAT,
  readFlowDocument,
  serializeFlowDocument,
  validateFlowGraph,
} from '@jobik/core'
import { describe, expect, it } from 'vitest'
import { pokedex } from './index.js'
import type { PokedexNodeId } from './types.js'

async function loadDocument() {
  const file = await readFlowDocument({ path: pokedex.path })
  if (file instanceof Error) throw file
  return file
}

describe('flow.jobik.json', () => {
  it('parses as a current-version jobik.flow document', async () => {
    const { document } = await loadDocument()
    expect(document.format).toBe(FLOW_DOCUMENT_FORMAT)
    expect(document.version).toBe(CURRENT_FLOW_VERSION)
  })

  it('is already in canonical on-disk form', async () => {
    const { document } = await loadDocument()
    const onDisk = await fs.readFile(pokedex.path, 'utf8')
    expect(serializeFlowDocument(document)).toBe(onDisk)
  })

  it('validates against the bound flow', async () => {
    const { document } = await loadDocument()
    const graph = validateFlowGraph({ flow: pokedex, document })
    expect(graph).not.toBeInstanceOf(Error)
    if (graph instanceof Error) return
    expect([...graph.startIds].sort()).toEqual(['card', 'roster'])
  })

  it('wires pipeline A from the card start to the composed image', async () => {
    const { document } = await loadDocument()
    const pipelineA = document.connections
      .filter((connection) => ['card', 'lookup', 'sprite'].includes(connection.from.node))
      .map(
        (connection) =>
          `${connection.from.node}.${connection.from.field} -> ${connection.to.node}.${connection.to.field}`,
      )
    expect(pipelineA).toEqual([
      'card.name -> lookup.name',
      'card.shiny -> lookup.shiny',
      'lookup.artworkUrl -> sprite.artworkUrl',
      'lookup.displayName -> compose.displayName',
      'lookup.number -> compose.number',
      'lookup.primaryType -> compose.primaryType',
      'lookup.secondaryType -> compose.secondaryType',
      'lookup.stats -> compose.stats',
      'card.theme -> compose.theme',
      'sprite.sprite -> compose.sprite',
    ])
  })

  it('wires pipeline B from the roster start to the standings table', async () => {
    const { document } = await loadDocument()
    const pipelineB = document.connections
      .filter((connection) => ['roster', 'rank'].includes(connection.from.node))
      .map(
        (connection) =>
          `${connection.from.node}.${connection.from.field} -> ${connection.to.node}.${connection.to.field}`,
      )
    expect(pipelineB).toEqual([
      'roster.names -> rank.names',
      'roster.metric -> rank.metric',
      'roster.metric -> standings.metric',
      'rank.entries -> standings.entries',
      'rank.missing -> standings.missing',
      'rank.leader -> standings.leader',
      'rank.leaderValue -> standings.leaderValue',
    ])
  })

  it('never lets a connection cross between the two pipelines', async () => {
    const { document } = await loadDocument()
    const pipelineOf: Record<string, 'A' | 'B'> = {
      card: 'A',
      lookup: 'A',
      sprite: 'A',
      compose: 'A',
      roster: 'B',
      rank: 'B',
      standings: 'B',
    }
    for (const connection of document.connections) {
      expect(pipelineOf[connection.from.node]).toBe(pipelineOf[connection.to.node])
    }
  })

  it('references only nodes and fields that exist on the bound flow', async () => {
    const { document } = await loadDocument()
    for (const connection of document.connections) {
      const source = pokedex.nodes[connection.from.node as PokedexNodeId]
      const target = pokedex.nodes[connection.to.node as PokedexNodeId]
      expect(source).toBeDefined()
      expect(target).toBeDefined()
      // A start has no output schema: its validated input becomes its output fields.
      const sourceFields = 'output' in source ? source.output.shape : source.input.shape
      expect(Object.keys(sourceFields)).toContain(connection.from.field)
      expect(Object.keys(target.input.shape)).toContain(connection.to.field)
    }
  })

  it('leaves no unconnected input on an ordinary node, so every literal map is empty', async () => {
    const { document } = await loadDocument()
    expect(Object.keys(document.literals)).toEqual([
      'lookup',
      'sprite',
      'compose',
      'rank',
      'standings',
    ])
    for (const literals of Object.values(document.literals)) expect(literals).toEqual({})

    const connectedInputs = new Set(document.connections.map((c) => `${c.to.node}.${c.to.field}`))
    for (const id of ['lookup', 'sprite', 'compose', 'rank', 'standings'] as const) {
      for (const field of Object.keys(pokedex.nodes[id].input.shape)) {
        expect(connectedInputs.has(`${id}.${field}`), `${id}.${field}`).toBe(true)
      }
    }
  })

  it('lays the two pipelines out on rows that cannot overlap', async () => {
    const { document } = await loadDocument()
    const pipelineA = ['card', 'lookup', 'sprite', 'compose'] as const
    const pipelineB = ['roster', 'rank', 'standings'] as const
    const lowestA = Math.max(...pipelineA.map((id) => document.layout[id]?.y ?? 0))
    const highestB = Math.min(...pipelineB.map((id) => document.layout[id]?.y ?? 0))
    expect(highestB).toBeGreaterThan(lowestA)
  })

  it('has a layout entry for every attached node and nothing else', async () => {
    const { document } = await loadDocument()
    expect(Object.keys(document.layout).sort()).toEqual(Object.keys(pokedex.nodes).sort())
  })
})
