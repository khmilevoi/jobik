import * as fs from 'node:fs/promises'
import {
  CURRENT_FLOW_VERSION,
  FLOW_DOCUMENT_FORMAT,
  readFlowDocument,
  serializeFlowDocument,
} from '@jobik/core'
import { describe, expect, it } from 'vitest'
import { publication } from './index.js'

async function loadDocument() {
  const file = await readFlowDocument({ path: publication.path })
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
    const onDisk = await fs.readFile(publication.path, 'utf8')
    expect(serializeFlowDocument(document)).toBe(onDisk)
  })

  it('carries a stable revision', async () => {
    const first = await loadDocument()
    const second = await loadDocument()
    expect(first.revision).toBe(second.revision)
    expect(first.revision.length).toBeGreaterThan(0)
  })

  it('holds exactly the four connections the canvas draws', async () => {
    const { document } = await loadDocument()
    expect(document.connections).toEqual([
      { from: { node: 'start1', field: 'title' }, to: { node: 'render', field: 'title' } },
      { from: { node: 'start1', field: 'markdown' }, to: { node: 'render', field: 'markdown' } },
      { from: { node: 'render', field: 'image' }, to: { node: 'publish', field: 'image' } },
      { from: { node: 'render', field: 'caption' }, to: { node: 'publish', field: 'caption' } },
    ])
  })

  it('references only nodes and fields that exist on the bound flow', async () => {
    const { document } = await loadDocument()
    for (const connection of document.connections) {
      const source = publication.nodes[connection.from.node as 'start1' | 'render' | 'publish']
      const target = publication.nodes[connection.to.node as 'start1' | 'render' | 'publish']
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
    expect(Object.keys(document.literals)).toEqual(['render', 'publish'])
    expect(document.literals.render).toEqual({})
    expect(document.literals.publish).toEqual({})

    const connectedInputs = new Set(document.connections.map((c) => `${c.to.node}.${c.to.field}`))
    for (const id of ['render', 'publish'] as const) {
      for (const field of Object.keys(publication.nodes[id].input.shape)) {
        expect(connectedInputs.has(`${id}.${field}`)).toBe(true)
      }
    }
  })

  it('lays the cards out where the Studio — default artboard puts them', async () => {
    const { document } = await loadDocument()
    expect(document.layout).toEqual({
      start1: { x: 56, y: 248 },
      render: { x: 386, y: 150 },
      publish: { x: 786, y: 380 },
    })
  })

  it('has a layout entry for every attached node and nothing else', async () => {
    const { document } = await loadDocument()
    expect(Object.keys(document.layout).sort()).toEqual(Object.keys(publication.nodes).sort())
  })
})
