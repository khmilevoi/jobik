import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { canvasColors } from '#canvas/canvasTokens.js'
import type { FlowCanvasEdge, FlowCanvasNode } from '#canvas/types.js'
import type { JobikClient } from '#client/index.js'
import { reatomStudio, StudioModelProvider } from '#model/index.js'
import { dragNode } from '#studio/canvasDragTestSupport.js'
import {
  dotGrid,
  FlowCanvas,
  nodePositions,
  syncReactFlowNodes,
  toReactFlowEdges,
  toReactFlowNodes,
} from './FlowCanvas.js'

afterEach(cleanup)

/**
 * The canvas renders `NodeCard`s, and a card reads its own overlay off the model, so mounting one
 * needs a provider. Nothing in this file drives a run: with no session the overlays are `undefined`
 * and every card draws the `data` these fixtures state, which is what each case is about.
 */
const CLIENT = {
  listFlows: vi.fn(async () => []),
  loadFlow: vi.fn(),
  validate: vi.fn(),
  save: vi.fn(),
  startRun: vi.fn(),
  cancelRun: vi.fn(),
  assetUrl: vi.fn(() => '/api/assets/x'),
  extensionBundleUrl: vi.fn(() => '/api/flows/x/ui.js'),
} as unknown as JobikClient

/** One model per mount, so a `rerender` changes the props and nothing else. */
function mountCanvas(node: ReactElement) {
  const model = reatomStudio({ client: CLIENT, externals: {}, importModule: async () => ({}) })
  const withModel = (child: ReactElement) => (
    <StudioModelProvider model={model}>{child}</StudioModelProvider>
  )
  const mounted = render(withModel(node))
  return { ...mounted, rerender: (next: ReactElement) => mounted.rerender(withModel(next)) }
}

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

  it('staggers the elbow of parallel edges by 16px, as the stepped artboard does', () => {
    const mapped = toReactFlowEdges(edges, 'start1', 'stepped')
    // `start1 -> render` twice, then `render -> publish` once: 0, 16, then 0 again.
    expect(mapped.map((edge) => edge.data?.elbowOffset)).toEqual([0, 16, 0])
  })

  it('keeps an elbow offset the caller stated', () => {
    const mapped = toReactFlowEdges([{ ...edges[0], elbowOffset: 40 }], 'start1', 'stepped')
    expect(mapped[0].data?.elbowOffset).toBe(40)
  })
})

/**
 * The half of "an in-flight drag survives a run" that belongs to the canvas.
 *
 * The other half is the model's: `canvas.nodes` carries structure only, so a stream frame no longer
 * rebuilds the array at all. This is the part that holds even when something does rebuild it —
 * `nodes` is a prop, and "must be referentially stable" is not a contract a prop can enforce.
 */
describe('syncReactFlowNodes', () => {
  const stated = toReactFlowNodes(nodes, edges, 'start1')
  const dragged = stated.map((node) =>
    node.id === 'render' ? { ...node, position: { x: 500, y: 300 } } : node,
  )

  it('keeps the position React Flow is writing when the props restate the old one', () => {
    const synced = syncReactFlowNodes(dragged, stated, nodePositions(nodes))
    expect(synced[1].position).toEqual({ x: 500, y: 300 })
  })

  it('takes the props’ position when the props actually moved the node', () => {
    const moved = nodes.map((node) =>
      node.id === 'render' ? { ...node, position: { x: 700, y: 20 } } : node,
    )
    const synced = syncReactFlowNodes(
      dragged,
      toReactFlowNodes(moved, edges, 'start1'),
      nodePositions(nodes),
    )
    expect(synced[1].position).toEqual({ x: 700, y: 20 })
  })

  it('still takes selection from the props, whatever the canvas holds', () => {
    const held = stated.map((node) => ({ ...node, selected: false }))
    const synced = syncReactFlowNodes(
      held,
      toReactFlowNodes(nodes, edges, 'start1', 'publish'),
      nodePositions(nodes),
    )
    expect(synced[2].selected).toBe(true)
  })

  it('takes a node the canvas has never seen whole', () => {
    const synced = syncReactFlowNodes([], stated, new Map())
    expect(synced).toEqual(stated)
  })
})

describe('dotGrid', () => {
  it('is the artboard grid: 22px apart, 2px across, offset -1', () => {
    // React Flow's `size` is the dot's diameter; the artboard's gradient stop is a 1px radius.
    expect(dotGrid).toEqual({
      variant: 'dots',
      gap: 22,
      size: 2,
      offset: -1,
      color: canvasColors.dotGrid,
    })
  })
})

describe('FlowCanvas', () => {
  it('renders the canvas slot', async () => {
    mountCanvas(<FlowCanvas nodes={nodes} edges={edges} startNodeId="start1" />)
    expect(await screen.findByTestId('flow-canvas')).toBeInTheDocument()
  })

  it('renders every node card and every edge', async () => {
    const { container } = mountCanvas(
      <FlowCanvas nodes={nodes} edges={edges} startNodeId="start1" />,
    )
    expect(await screen.findByTestId('node-card-start1')).toBeInTheDocument()
    expect(screen.getByTestId('node-card-render')).toBeInTheDocument()
    expect(screen.getByTestId('node-card-publish')).toBeInTheDocument()

    await waitFor(() => {
      expect(container.querySelectorAll('.react-flow__edge')).toHaveLength(3)
    })
  })

  it('shows the dot grid by default and hides it on request', async () => {
    const { container, rerender } = mountCanvas(
      <FlowCanvas nodes={nodes} edges={edges} startNodeId="start1" />,
    )
    await waitFor(() => {
      expect(container.querySelector('.react-flow__background')).not.toBeNull()
    })

    rerender(<FlowCanvas nodes={nodes} edges={edges} startNodeId="start1" showDotGrid={false} />)
    expect(container.querySelector('.react-flow__background')).toBeNull()
  })

  it('carries the zoom controls', async () => {
    mountCanvas(<FlowCanvas nodes={nodes} edges={edges} startNodeId="start1" />)
    expect(await screen.findByTestId('zoom-controls')).toBeInTheDocument()
    expect(screen.getByTestId('zoom-readout')).toHaveTextContent('100%')
  })
})

/**
 * The canvas's own way to move the run panel's entry point — a click on any card whose
 * `data.isStart` is `true`, alongside the sidebar's `Start` section.
 */
describe('FlowCanvas — selecting a start by clicking its card', () => {
  // `fireEvent.click` rather than `userEvent.click`: React Flow's own drag handling listens for a
  // real `mousedown` on the node wrapper, and `userEvent`'s full pointer sequence trips it up under
  // jsdom (d3-drag reads `event.view`, which jsdom's synthesised event never sets) — an environment
  // quirk with nothing to do with the click handler under test, which only needs the `click` itself.
  it('reports a click on a start card', async () => {
    const onSelectStart = vi.fn()
    mountCanvas(
      <FlowCanvas nodes={nodes} edges={edges} startNodeId="start1" onSelectStart={onSelectStart} />,
    )
    fireEvent.click(await screen.findByTestId('node-card-start1'))
    expect(onSelectStart).toHaveBeenCalledWith('start1')
  })

  it('does nothing for a click on a card that is not a start', async () => {
    const onSelectStart = vi.fn()
    mountCanvas(
      <FlowCanvas nodes={nodes} edges={edges} startNodeId="start1" onSelectStart={onSelectStart} />,
    )
    fireEvent.click(await screen.findByTestId('node-card-render'))
    expect(onSelectStart).not.toHaveBeenCalled()
  })
})

/**
 * The same claim as `syncReactFlowNodes`, driven through the real drag stack rather than the
 * function underneath it — because "the canvas kept the node where the pointer left it" is only
 * true if React Flow agrees, and React Flow reads the position out of the state this component
 * holds when the next gesture starts.
 *
 * Persisting a drop is P14's, so the props still state the pre-drag position throughout: that is
 * exactly the case a rebuilt array used to lose.
 */
describe('FlowCanvas — a drag the props do not know about yet', () => {
  it('leaves a dropped node where it was dropped when the node array is rebuilt', async () => {
    const onNodeLayoutChange = vi.fn()
    const canvas = (
      <FlowCanvas
        nodes={nodes}
        edges={edges}
        startNodeId="start1"
        onNodeLayoutChange={onNodeLayoutChange}
      />
    )
    const { container, rerender } = mountCanvas(canvas)
    await screen.findByTestId('node-card-render')

    dragNode(container, 'render', 40, 30)
    const dropped = onNodeLayoutChange.mock.lastCall?.[0]
    expect(dropped).toMatchObject({ nodeId: 'render' })

    // What a stream frame used to do: the same graph, a new array identity.
    rerender(
      <FlowCanvas
        nodes={[...nodes]}
        edges={[...edges]}
        startNodeId="start1"
        onNodeLayoutChange={onNodeLayoutChange}
      />,
    )

    dragNode(container, 'render', 10, 10)
    expect(onNodeLayoutChange.mock.lastCall?.[0]).toEqual({
      nodeId: 'render',
      position: { x: dropped.position.x + 10, y: dropped.position.y + 10 },
    })
  })
})
