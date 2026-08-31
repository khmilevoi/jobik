import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { canvasColors } from '#canvas/canvasTokens.js'
import type { FlowCanvasEdge, FlowCanvasNode } from '#canvas/types.js'
import { dotGrid, FlowCanvas, toReactFlowEdges, toReactFlowNodes } from './FlowCanvas.js'

afterEach(cleanup)

/** The `Studio — default` graph, at the artboard's own positions. */
const nodes: readonly FlowCanvasNode[] = [
  {
    id: 'start1',
    position: { x: 56, y: 248 },
    data: {
      id: 'start1',
      state: 'idle',
      isStart: true,
      selected: true,
      outputs: [
        { name: 'title', annotation: 'string' },
        { name: 'markdown', annotation: 'string' },
      ],
    },
  },
  {
    id: 'render',
    position: { x: 386, y: 150 },
    data: {
      id: 'render',
      state: 'ok',
      status: 'ok',
      elapsed: '2.1s',
      inputs: [
        { name: 'title', annotation: 'string' },
        { name: 'markdown', annotation: 'string' },
      ],
      outputs: [{ name: 'image', annotation: 'Buffer' }],
    },
  },
  {
    id: 'publish',
    position: { x: 786, y: 380 },
    data: {
      id: 'publish',
      state: 'idle',
      status: 'idle',
      inputs: [{ name: 'image', annotation: 'Buffer' }],
    },
  },
]

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

describe('toReactFlowNodes', () => {
  it('types every node, faces the handles right and fills liveFields from the edges', () => {
    const mapped = toReactFlowNodes(nodes, edges, 'start1', 'start1')
    expect(mapped).toHaveLength(3)
    expect(mapped[0]).toMatchObject({
      id: 'start1',
      type: 'jobikNode',
      position: { x: 56, y: 248 },
      sourcePosition: 'right',
      targetPosition: 'left',
      selected: true,
    })
    expect(mapped[0].data.liveFields).toEqual(['source:title', 'source:markdown'])
    expect(mapped[1].data.liveFields).toEqual(['target:title', 'target:markdown'])
    expect(mapped[2].data.liveFields).toEqual([])
  })

  it('selects the node the canvas was told about when the data does not say', () => {
    const mapped = toReactFlowNodes(nodes, edges, 'start1', 'publish')
    expect(mapped[2].selected).toBe(true)
    expect(mapped[1].selected).toBe(false)
  })
})

describe('toReactFlowEdges', () => {
  it('accents the edges leaving the selected start and idles the rest', () => {
    const mapped = toReactFlowEdges(edges, 'start1', 'curved')
    expect(mapped[0]).toMatchObject({
      id: 'e1',
      type: 'fieldEdge',
      source: 'start1',
      target: 'render',
      sourceHandle: 'source:title',
      targetHandle: 'target:title',
    })
    expect(mapped[0].data?.tone).toBe('accent')
    expect(mapped[2].data?.tone).toBe('idle')
  })

  it('passes the canvas edge shape down to every edge', () => {
    const mapped = toReactFlowEdges(edges, 'start1', 'stepped')
    expect(mapped.every((edge) => edge.data?.shape === 'stepped')).toBe(true)
  })

  it('lets a run tone override the start rule', () => {
    const mapped = toReactFlowEdges([{ ...edges[0], tone: 'active' }], 'start1', 'curved')
    expect(mapped[0].data?.tone).toBe('active')
  })
})

describe('dotGrid', () => {
  it('is the artboard grid: 22px, 1px dots, offset -1', () => {
    expect(dotGrid).toEqual({
      variant: 'dots',
      gap: 22,
      size: 1,
      offset: -1,
      color: canvasColors.dotGrid,
    })
  })
})

describe('FlowCanvas', () => {
  it('renders the canvas slot', async () => {
    render(<FlowCanvas nodes={nodes} edges={edges} startNodeId="start1" />)
    expect(await screen.findByTestId('flow-canvas')).toBeInTheDocument()
  })

  it('renders every node card and every edge', async () => {
    const { container } = render(<FlowCanvas nodes={nodes} edges={edges} startNodeId="start1" />)
    expect(await screen.findByTestId('node-card-start1')).toBeInTheDocument()
    expect(screen.getByTestId('node-card-render')).toBeInTheDocument()
    expect(screen.getByTestId('node-card-publish')).toBeInTheDocument()

    await waitFor(() => {
      expect(container.querySelectorAll('.react-flow__edge')).toHaveLength(3)
    })
  })

  it('shows the dot grid by default and hides it on request', async () => {
    const { container, rerender } = render(
      <FlowCanvas nodes={nodes} edges={edges} startNodeId="start1" />,
    )
    await waitFor(() => {
      expect(container.querySelector('.react-flow__background')).not.toBeNull()
    })

    rerender(<FlowCanvas nodes={nodes} edges={edges} startNodeId="start1" showDotGrid={false} />)
    expect(container.querySelector('.react-flow__background')).toBeNull()
  })

  it('carries the zoom controls', async () => {
    render(<FlowCanvas nodes={nodes} edges={edges} startNodeId="start1" />)
    expect(await screen.findByTestId('zoom-controls')).toBeInTheDocument()
    expect(screen.getByTestId('zoom-readout')).toHaveTextContent('100%')
  })
})
