import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import defaultExport, { buildPublicationFlow, publication } from './index.js'
import { publicationInventory } from './nodes/index.js'

describe('publication binding', () => {
  it('is named after the flow the top bar shows', () => {
    expect(publication.name).toBe('publication')
  })

  it('binds to the absolute path of its own document', () => {
    expect(path.isAbsolute(publication.path)).toBe(true)
    expect(path.basename(publication.path)).toBe('flow.jobik.json')
    expect(path.dirname(publication.path)).toBe(path.dirname(import.meta.filename))
  })

  it('exposes the same value as the default export used for UI discovery', () => {
    expect(defaultExport).toBe(publication)
  })

  it('attaches exactly the three nodes the canvas shows, in order', () => {
    expect(Object.keys(publication.nodes)).toEqual(['start1', 'render', 'publish'])
  })

  it('attaches them with the kinds the sidebar lists', () => {
    expect(publication.nodes.start1.kind).toBe('start')
    expect(publication.nodes.render.kind).toBe('transform')
    expect(publication.nodes.publish.kind).toBe('sink')
  })

  it('exposes the field names the node cards show', () => {
    expect(Object.keys(publication.nodes.start1.input.shape)).toEqual(['title', 'markdown'])
    expect(Object.keys(publication.nodes.render.input.shape)).toEqual(['title', 'markdown'])
    expect(Object.keys(publication.nodes.render.output.shape)).toEqual(['image', 'caption'])
    expect(Object.keys(publication.nodes.publish.input.shape)).toEqual(['image', 'caption'])
    expect(Object.keys(publication.nodes.publish.output.shape)).toEqual(['url'])
  })

  it('can be rebound to another absolute path without duplicating the graph', () => {
    const elsewhere = path.resolve(path.dirname(import.meta.filename), 'other.jobik.json')
    const rebound = buildPublicationFlow().bind('path', elsewhere)
    expect(rebound.path).toBe(elsewhere)
    expect(Object.keys(rebound.nodes)).toEqual(['start1', 'render', 'publish'])
    expect(rebound.nodes.render).toBe(publication.nodes.render)
  })

  it('rejects a relative binding path', () => {
    expect(() => buildPublicationFlow().bind('path', 'flow.jobik.json')).toThrow(TypeError)
  })
})

describe('publicationInventory', () => {
  it('lists the four definitions the sidebar Inventory group shows', () => {
    expect(publicationInventory.map((entry) => entry.name)).toEqual([
      'start<T>',
      'markdown',
      'imageOut',
      'httpSink',
    ])
    expect(publicationInventory.map((entry) => entry.label)).toEqual([
      'entry',
      'transform',
      'renderer',
      'sink',
    ])
  })

  it('holds one more definition than the flow attaches', () => {
    // The artboard shows four inventory rows against a node count of 3: `markdown` is available
    // but unattached, and Inventory is read-only in v1. Do not attach it to make these match.
    expect(publicationInventory).toHaveLength(4)
    expect(Object.keys(publication.nodes)).toHaveLength(3)
  })

  it('points at the definitions the flow actually attached', () => {
    expect(publicationInventory[0].definition).toBe(publication.nodes.start1)
    expect(publicationInventory[2].definition).toBe(publication.nodes.render)
    expect(publicationInventory[3].definition).toBe(publication.nodes.publish)
  })
})
