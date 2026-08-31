import type { FlowDocument } from '@jobik/core'
import { describe, expect, it } from 'vitest'
import type { SafeFlowDescriptorPayload } from '#client/index.js'
import {
  toCanvasEdges,
  toCanvasNodes,
  toFlowNodeSummaries,
  toFlowSummaries,
  toInventory,
  waitingOnField,
} from './graphModel.js'
import { toFlowProblems } from './problems.js'

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

  it('produces the whole start node exactly: position, start flag, and every field', () => {
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
          { name: 'title', annotation: 'string' },
          { name: 'markdown', annotation: 'string' },
        ],
        outputs: [
          { name: 'title', annotation: 'string' },
          { name: 'markdown', annotation: 'string' },
        ],
      },
    })
  })

  it('produces the whole render node exactly: a connected field, a literal-bearing field, and a dangling one render identically — none carries a tone', () => {
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
          { name: 'title', annotation: 'string' },
          { name: 'markdown', annotation: 'string' },
          { name: 'quality', annotation: 'number' },
        ],
        outputs: [
          { name: 'image', annotation: 'Buffer' },
          { name: 'caption', annotation: 'string' },
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

  it('never sets a tone on any field — a connected field, a literal-bearing field and a dangling one are indistinguishable at rest', () => {
    // The `Studio — default` artboard renders `render`'s connected `title` input with the same
    // plain label colour (`#aab1b7`) as its unconnected `markdown` input, and `start1`'s outputs
    // (never "satisfied") with the active colour (`#c3c9ce`) instead — tone tracks `isStart`, not
    // connection or literal satisfaction. `canvas/fields.ts`'s `resolveFieldTone` already supplies
    // that default whenever `field.tone` is left unset, so this mapper must never set it.
    const node = toCanvasNodes({ descriptor: DESCRIPTOR, document: DOCUMENT })[1]
    const fields = [...(node?.data.inputs ?? []), ...(node?.data.outputs ?? [])]

    expect(fields.length).toBeGreaterThan(0)
    for (const field of fields) {
      expect(Object.hasOwn(field, 'tone')).toBe(false)
    }
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

  it('falls every node back into a column against an empty document, still without a tone on any field', () => {
    const nodes = toCanvasNodes({ descriptor: DESCRIPTOR, document: EMPTY_DOCUMENT })

    expect(nodes.map((node) => node.position)).toEqual([
      { x: 0, y: 0 },
      { x: 320, y: 0 },
    ])
    expect(
      nodes
        .flatMap((node) => node.data.inputs ?? [])
        .every((field) => !Object.hasOwn(field, 'tone')),
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

/** Closeout finding 1, queued: `Waiting on render.image` (design 671) is a fact of the graph. */
describe('waitingOnField', () => {
  const CHAIN = {
    format: 'jobik.flow',
    version: 1,
    connections: [
      { from: { node: 'start1', field: 'title' }, to: { node: 'render', field: 'title' } },
      { from: { node: 'render', field: 'image' }, to: { node: 'publish', field: 'image' } },
      { from: { node: 'start1', field: 'markdown' }, to: { node: 'publish', field: 'caption' } },
    ],
    literals: {},
    layout: {},
  } as unknown as FlowDocument

  it('names the upstream node.field the artboard template asks for', () => {
    expect(waitingOnField(DOCUMENT, 'render')).toBe('start1.title')
  })

  it('skips an upstream that has already settled and names the one still owed', () => {
    // `start1` has produced; `render` has not. `publish` is blocked on `render.image`, which is
    // the artboard's own line — not on the settled `start1.markdown` that comes first in the list.
    expect(waitingOnField(CHAIN, 'publish', new Set(['start1']))).toBe('render.image')
  })

  it('falls back to the first incoming connection once every upstream has settled', () => {
    expect(waitingOnField(CHAIN, 'publish', new Set(['start1', 'render']))).toBe('render.image')
  })

  it('has nothing to say about a node with no incoming connection', () => {
    expect(waitingOnField(CHAIN, 'start1')).toBeUndefined()
    expect(waitingOnField(EMPTY_DOCUMENT, 'render')).toBeUndefined()
  })
})

/**
 * `3D` — the marks a validation result puts on the canvas. What is asserted is that the model
 * reaches the card and the edge; which colours those resolve to is `canvas/`'s to decide.
 */
describe('the 3D validation marks', () => {
  const mismatch = toFlowProblems({
    error: {
      _tag: 'ConnectionError',
      message: 'the flow graph is invalid',
      from: { node: 'start1', field: 'title' },
      to: { node: 'render', field: 'title' },
    },
    document: DOCUMENT,
  })

  it('puts the marked node on the solid card and prints its count', () => {
    const nodes = toCanvasNodes({ descriptor: DESCRIPTOR, document: DOCUMENT, problems: mismatch })
    const render = nodes.find((node) => node.id === 'render')

    expect(render?.data.problem).toBe('error')
    expect(render?.data.problemCount).toBe('1 error')
    expect(nodes.find((node) => node.id === 'start1')?.data.problem).toBeUndefined()
  })

  it('marks the two ports and leaves every other field alone', () => {
    const nodes = toCanvasNodes({ descriptor: DESCRIPTOR, document: DOCUMENT, problems: mismatch })
    const render = nodes.find((node) => node.id === 'render')
    const start1 = nodes.find((node) => node.id === 'start1')

    expect(render?.data.inputs?.find((field) => field.name === 'title')?.problem).toBe('mismatch')
    expect(render?.data.inputs?.find((field) => field.name === 'markdown')?.problem).toBeUndefined()
    expect(start1?.data.outputs?.find((field) => field.name === 'title')?.problem).toBe('linked')
  })

  it('paints only the failing edge', () => {
    const edges = toCanvasEdges(DOCUMENT, mismatch)
    expect(edges).toHaveLength(1)
    expect(edges[0]?.tone).toBe('error')
    expect(toCanvasEdges(DOCUMENT)[0]?.tone).toBeUndefined()
  })

  it('says `no source` where the port has none, and gives its card the blocked treatment', () => {
    const blocked = toFlowProblems({
      error: {
        _tag: 'ConnectionError',
        message: "required input field 'render.markdown' is neither connected nor given a literal",
        to: { node: 'render', field: 'markdown' },
      },
      document: DOCUMENT,
    })
    const nodes = toCanvasNodes({ descriptor: DESCRIPTOR, document: DOCUMENT, problems: blocked })
    const render = nodes.find((node) => node.id === 'render')

    expect(render?.data.problem).toBe('blocked')
    // The blocked card's trailing cell is empty on the artboard.
    expect(render?.data.problemCount).toBeUndefined()
    const markdown = render?.data.inputs?.find((field) => field.name === 'markdown')
    expect(markdown?.problem).toBe('unsourced')
    expect(markdown?.annotation).toBe('no source')
  })

  it('marks nothing when no check has run', () => {
    const nodes = toCanvasNodes({ descriptor: DESCRIPTOR, document: DOCUMENT })
    for (const node of nodes) expect(node.data.problem).toBeUndefined()
  })
})
