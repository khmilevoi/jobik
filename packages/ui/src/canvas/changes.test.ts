import { describe, expect, it } from 'vitest'
import { toFieldConnection, toNodeLayoutChange } from './changes.js'
import { liveFieldsByNode } from './fields.js'
import type { FlowCanvasEdge } from './types.js'

describe('toNodeLayoutChange', () => {
  it('reduces a dragged node to its id and final position', () => {
    expect(toNodeLayoutChange({ id: 'render', position: { x: 386.5, y: 150 } })).toEqual({
      nodeId: 'render',
      position: { x: 386.5, y: 150 },
    })
  })
})

describe('toFieldConnection', () => {
  it('reads the field names back out of the two handle ids', () => {
    expect(
      toFieldConnection({
        source: 'start1',
        target: 'render',
        sourceHandle: 'source:title',
        targetHandle: 'target:title',
      }),
    ).toEqual({
      source: 'start1',
      sourceField: 'title',
      target: 'render',
      targetField: 'title',
    })
  })

  it('refuses a connection that did not land on a field handle', () => {
    expect(
      toFieldConnection({
        source: 'start1',
        target: 'render',
        sourceHandle: null,
        targetHandle: 'target:title',
      }),
    ).toBeUndefined()
    expect(
      toFieldConnection({
        source: 'start1',
        target: 'render',
        sourceHandle: 'source:title',
        targetHandle: 'nonsense',
      }),
    ).toBeUndefined()
  })

  it('refuses a connection whose handles face the wrong way', () => {
    expect(
      toFieldConnection({
        source: 'start1',
        target: 'render',
        sourceHandle: 'target:title',
        targetHandle: 'target:title',
      }),
    ).toBeUndefined()
  })
})

describe('liveFieldsByNode', () => {
  const edges: readonly FlowCanvasEdge[] = [
    { id: 'e1', source: 'start1', sourceField: 'title', target: 'render', targetField: 'title' },
    {
      id: 'e2',
      source: 'start1',
      sourceField: 'markdown',
      target: 'render',
      targetField: 'markdown',
    },
    { id: 'e3', source: 'render', sourceField: 'image', target: 'publish', targetField: 'image' },
  ]

  it('lists the accent handle ids per node, and nothing for a node with none', () => {
    const live = liveFieldsByNode(edges, 'start1')
    expect(live.get('start1')).toEqual(['source:title', 'source:markdown'])
    expect(live.get('render')).toEqual(['target:title', 'target:markdown'])
    expect(live.get('publish')).toBeUndefined()
  })

  it('never lists the same handle twice', () => {
    const live = liveFieldsByNode([edges[0], { ...edges[0], id: 'duplicate' }], 'start1')
    expect(live.get('start1')).toEqual(['source:title'])
  })
})
