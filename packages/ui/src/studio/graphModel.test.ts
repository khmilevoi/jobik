import type { FlowDocument } from '@jobik/core'
import { describe, expect, it } from 'vitest'
import type { SafeFlowDescriptorPayload } from '../client/index.js'
import {
  toCanvasEdges,
  toCanvasNodes,
  toFlowNodeSummaries,
  toFlowSummaries,
  toInventory,
} from './graphModel.js'

const DESCRIPTOR: SafeFlowDescriptorPayload = {
  id: 'publication',
  name: 'publication',
  documentFile: 'flow.jobik.json',
  startIds: ['start1'],
  nodes: [
    {
      id: 'start1',
      kind: 'start',
      title: 'start',
      input: {
        nodeId: 'start1',
        fields: [
          { field: 'title', required: true, annotation: 'string', control: { kind: 'string' } },
          { field: 'markdown', required: true, annotation: 'string', control: { kind: 'string' } },
        ],
      },
      output: {
        nodeId: 'start1',
        fields: [
          { field: 'title', required: true, annotation: 'string' },
          { field: 'markdown', required: true, annotation: 'string' },
        ],
      },
    },
    {
      id: 'render',
      kind: 'transform',
      title: 'imageOut',
      input: {
        nodeId: 'render',
        fields: [
          { field: 'title', required: true, annotation: 'string', control: { kind: 'string' } },
          { field: 'markdown', required: true, annotation: 'string', control: { kind: 'string' } },
          {
            field: 'quality',
            required: false,
            annotation: 'number',
            control: { kind: 'number', integer: true },
          },
        ],
      },
      output: {
        nodeId: 'render',
        fields: [
          { field: 'image', required: true, annotation: 'Buffer', asset: { mime: 'image/png' } },
          { field: 'caption', required: true, annotation: 'string' },
        ],
      },
    },
  ],
}

const DOCUMENT = {
  format: 'jobik.flow',
  version: 1,
  connections: [
    { from: { node: 'start1', field: 'title' }, to: { node: 'render', field: 'title' } },
  ],
  literals: { render: { quality: 90 } },
  layout: { start1: { x: 56, y: 248 } },
} as unknown as FlowDocument

const EMPTY_DOCUMENT = {
  format: 'jobik.flow',
  version: 1,
  connections: [],
  literals: {},
  layout: {},
} as unknown as FlowDocument

describe('toCanvasNodes', () => {
  it('places nodes from the document layout', () => {
    expect(toCanvasNodes({ descriptor: DESCRIPTOR, document: DOCUMENT })[0]?.position).toEqual({
      x: 56,
      y: 248,
    })
  })

  it('falls back to a column for a node the document does not place', () => {
    expect(toCanvasNodes({ descriptor: DESCRIPTOR, document: DOCUMENT })[1]?.position).toEqual({
      x: 320,
      y: 0,
    })
  })

  it('produces the whole start node exactly: position, start flag, and every field with its tone', () => {
    const nodes = toCanvasNodes({ descriptor: DESCRIPTOR, document: DOCUMENT })

    expect(nodes[0]).toEqual({
      id: 'start1',
      position: { x: 56, y: 248 },
      data: {
        id: 'start1',
        state: 'idle',
        isStart: true,
        selected: false,
        inputs: [
          { name: 'title', annotation: 'string', tone: 'normal' },
          { name: 'markdown', annotation: 'string', tone: 'normal' },
        ],
        outputs: [
          { name: 'title', annotation: 'string', tone: 'normal' },
          { name: 'markdown', annotation: 'string', tone: 'normal' },
        ],
      },
    })
  })

  it('produces the whole render node exactly: a connected field, a literal-bearing field, and a dangling one', () => {
    const nodes = toCanvasNodes({ descriptor: DESCRIPTOR, document: DOCUMENT })

    expect(nodes[1]).toEqual({
      id: 'render',
      position: { x: 320, y: 0 },
      data: {
        id: 'render',
        state: 'idle',
        isStart: false,
        selected: false,
        inputs: [
          { name: 'title', annotation: 'string', tone: 'active' },
          { name: 'markdown', annotation: 'string', tone: 'normal' },
          { name: 'quality', annotation: 'number', tone: 'active' },
        ],
        outputs: [
          { name: 'image', annotation: 'Buffer', tone: 'normal' },
          { name: 'caption', annotation: 'string', tone: 'normal' },
        ],
      },
    })
  })

  it('marks the declared start as a start node', () => {
    const nodes = toCanvasNodes({ descriptor: DESCRIPTOR, document: DOCUMENT })

    expect(nodes[0]?.data.isStart).toBe(true)
    expect(nodes[1]?.data.isStart).toBe(false)
  })

  it('carries every input and output field with its type annotation', () => {
    const nodes = toCanvasNodes({ descriptor: DESCRIPTOR, document: DOCUMENT })

    expect(nodes[1]?.data.inputs?.map((field) => [field.name, field.annotation])).toEqual([
      ['title', 'string'],
      ['markdown', 'string'],
      ['quality', 'number'],
    ])
    expect(nodes[1]?.data.outputs?.map((field) => field.name)).toEqual(['image', 'caption'])
  })

  it('treats a connected input field and a literal-bearing one as satisfied, and leaves an unconnected field dangling', () => {
    const inputs =
      toCanvasNodes({ descriptor: DESCRIPTOR, document: DOCUMENT })[1]?.data.inputs ?? []

    expect(inputs.find((field) => field.name === 'title')?.tone).toBe('active')
    expect(inputs.find((field) => field.name === 'quality')?.tone).toBe('active')
    expect(inputs.find((field) => field.name === 'markdown')?.tone).toBe('normal')
  })

  it('leaves output fields at normal tone at rest', () => {
    const outputs =
      toCanvasNodes({ descriptor: DESCRIPTOR, document: DOCUMENT })[1]?.data.outputs ?? []

    expect(outputs.every((field) => field.tone === 'normal')).toBe(true)
  })

  it('applies a run overlay to the card state, annotations, detail and output slot', () => {
    const nodes = toCanvasNodes({
      descriptor: DESCRIPTOR,
      document: DOCUMENT,
      overlays: new Map([
        [
          'render',
          {
            state: 'running' as const,
            status: 'running',
            elapsed: '1.3s',
            progress: 0.5,
            inputAnnotation: 'received',
            outputAnnotation: 'pending',
            detail: { kind: 'queued', waitingOn: 'render.image' },
            outputSlot: { skeleton: true },
          },
        ],
      ]),
    })

    const render = nodes[1]?.data
    expect(render?.state).toBe('running')
    expect(render?.status).toBe('running')
    expect(render?.elapsed).toBe('1.3s')
    expect(render?.progress).toBe(0.5)
    expect(render?.detail).toEqual({ kind: 'queued', waitingOn: 'render.image' })
    expect(render?.outputSlot).toEqual({ skeleton: true })
    expect(render?.inputs?.every((field) => field.annotation === 'received')).toBe(true)
    expect(render?.outputs?.every((field) => field.annotation === 'pending')).toBe(true)
  })

  it('leaves every node idle, with no status/elapsed/progress/detail/outputSlot, when no overlay is supplied', () => {
    const nodes = toCanvasNodes({ descriptor: DESCRIPTOR, document: DOCUMENT })

    expect(nodes.every((node) => node.data.state === 'idle')).toBe(true)
    for (const node of nodes) {
      expect(node.data.status).toBeUndefined()
      expect(node.data.elapsed).toBeUndefined()
      expect(node.data.progress).toBeUndefined()
      expect(node.data.detail).toBeUndefined()
      expect(node.data.outputSlot).toBeUndefined()
    }
  })

  it('marks the selected node', () => {
    const nodes = toCanvasNodes({
      descriptor: DESCRIPTOR,
      document: DOCUMENT,
      selectedNodeId: 'render',
    })

    expect(nodes[0]?.data.selected).toBe(false)
    expect(nodes[1]?.data.selected).toBe(true)
  })

  it('falls every node back into a column, and dangles every field, against an empty document', () => {
    const nodes = toCanvasNodes({ descriptor: DESCRIPTOR, document: EMPTY_DOCUMENT })

    expect(nodes.map((node) => node.position)).toEqual([
      { x: 0, y: 0 },
      { x: 320, y: 0 },
    ])
    expect(
      nodes.flatMap((node) => node.data.inputs ?? []).every((field) => field.tone === 'normal'),
    ).toBe(true)
  })
})

describe('toCanvasEdges', () => {
  it('turns each connection into a field-to-field edge with a stable id', () => {
    expect(toCanvasEdges(DOCUMENT)).toEqual([
      {
        id: 'start1.title->render.title',
        source: 'start1',
        sourceField: 'title',
        target: 'render',
        targetField: 'title',
      },
    ])
  })

  it('produces no edges for a document with no connections', () => {
    expect(toCanvasEdges(EMPTY_DOCUMENT)).toEqual([])
  })

  it('passes through a connection whose node id is absent from the descriptor, deferring existence checks elsewhere', () => {
    const documentWithGhostNode = {
      ...DOCUMENT,
      connections: [
        { from: { node: 'ghost', field: 'out' }, to: { node: 'render', field: 'markdown' } },
      ],
    } as unknown as FlowDocument

    expect(toCanvasEdges(documentWithGhostNode)).toEqual([
      {
        id: 'ghost.out->render.markdown',
        source: 'ghost',
        sourceField: 'out',
        target: 'render',
        targetField: 'markdown',
      },
    ])
  })
})

describe('the sidebar lists', () => {
  it('maps node kinds onto the two dot tones a node at rest can have', () => {
    expect(toFlowNodeSummaries(DESCRIPTOR)).toEqual([
      { id: 'start1', kind: 'start', dot: 'start' },
      { id: 'render', kind: 'transform', dot: 'neutral' },
    ])
  })

  it('lists each node definition once, by its title', () => {
    expect(toInventory(DESCRIPTOR)).toEqual([
      { name: 'start', kind: 'start' },
      { name: 'imageOut', kind: 'transform' },
    ])
  })

  it('passes the flow list through unchanged', () => {
    expect(toFlowSummaries([{ id: 'publication', name: 'publication', nodeCount: 3 }])).toEqual([
      { id: 'publication', name: 'publication', nodeCount: 3 },
    ])
  })
})
