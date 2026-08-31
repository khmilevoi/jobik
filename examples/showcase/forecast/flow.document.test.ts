import * as fs from 'node:fs/promises'
import {
  CURRENT_FLOW_VERSION,
  FLOW_DOCUMENT_FORMAT,
  readFlowDocument,
  serializeFlowDocument,
  validateFlowGraph,
} from '@jobik/core'
import { describe, expect, it } from 'vitest'
import { forecast } from './index.js'
import type { ForecastNodeId } from './types.js'

async function loadDocument() {
  const file = await readFlowDocument({ path: forecast.path })
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
    const onDisk = await fs.readFile(forecast.path, 'utf8')
    expect(serializeFlowDocument(document)).toBe(onDisk)
  })

  it('carries a stable revision', async () => {
    const first = await loadDocument()
    const second = await loadDocument()
    expect(first.revision).toBe(second.revision)
    expect(first.revision.length).toBeGreaterThan(0)
  })

  it('binds against the flow without a single connection error', async () => {
    const { document } = await loadDocument()
    const graph = validateFlowGraph({ flow: forecast, document })
    expect(graph).not.toBeInstanceOf(Error)
  })

  it('wires the start into the one node that reaches the network', async () => {
    const { document } = await loadDocument()
    const fromStart = document.connections.filter((connection) => connection.from.node === 'start1')
    expect(fromStart).toEqual([
      { from: { node: 'start1', field: 'latitude' }, to: { node: 'fetch', field: 'latitude' } },
      { from: { node: 'start1', field: 'longitude' }, to: { node: 'fetch', field: 'longitude' } },
      { from: { node: 'start1', field: 'days' }, to: { node: 'fetch', field: 'days' } },
      { from: { node: 'start1', field: 'unit' }, to: { node: 'fetch', field: 'unit' } },
    ])
  })

  it('hands the three daily series and their day labels to summarise', async () => {
    const { document } = await loadDocument()
    const intoSummarise = document.connections.filter(
      (connection) => connection.to.node === 'summarise',
    )
    expect(intoSummarise.map((connection) => connection.to.field)).toEqual([
      'dates',
      'maxTemperatures',
      'minTemperatures',
      'precipitation',
    ])
    expect(intoSummarise.every((connection) => connection.from.node === 'fetch')).toBe(true)
  })

  it('fans thirteen fields into report, four labels and nine measurements', async () => {
    const { document } = await loadDocument()
    const intoReport = document.connections.filter((connection) => connection.to.node === 'report')
    expect(intoReport).toHaveLength(13)
    const sources = intoReport.map((connection) => connection.from.node)
    expect(sources.filter((node) => node === 'fetch')).toHaveLength(4)
    expect(sources.filter((node) => node === 'summarise')).toHaveLength(9)
  })

  it('names the same field on both ends of every connection', async () => {
    const { document } = await loadDocument()
    for (const connection of document.connections) {
      expect(connection.to.field).toBe(connection.from.field)
    }
  })

  it('references only nodes and fields that exist on the bound flow', async () => {
    const { document } = await loadDocument()
    for (const connection of document.connections) {
      const source = forecast.nodes[connection.from.node as ForecastNodeId]
      const target = forecast.nodes[connection.to.node as ForecastNodeId]
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
    expect(Object.keys(document.literals)).toEqual(['fetch', 'summarise', 'report'])
    for (const values of Object.values(document.literals)) {
      expect(values).toEqual({})
    }

    const connected = new Set(document.connections.map((c) => `${c.to.node}.${c.to.field}`))
    for (const id of ['fetch', 'summarise', 'report'] as const) {
      for (const field of Object.keys(forecast.nodes[id].input.shape)) {
        expect(connected.has(`${id}.${field}`)).toBe(true)
      }
    }
  })

  it('gives every input field at most one incoming connection', async () => {
    const { document } = await loadDocument()
    const slots = document.connections.map((c) => `${c.to.node}.${c.to.field}`)
    expect(new Set(slots).size).toBe(slots.length)
  })

  it('lays the four cards out left to right', async () => {
    const { document } = await loadDocument()
    expect(document.layout).toEqual({
      start1: { x: 56, y: 248 },
      fetch: { x: 386, y: 150 },
      summarise: { x: 786, y: 180 },
      report: { x: 1186, y: 300 },
    })
  })

  it('has a layout entry for every attached node and nothing else', async () => {
    const { document } = await loadDocument()
    expect(Object.keys(document.layout).sort()).toEqual(Object.keys(forecast.nodes).sort())
  })
})
