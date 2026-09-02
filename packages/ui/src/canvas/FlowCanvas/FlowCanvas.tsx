import { reatomComponent } from '@reatom/react'
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  type Connection,
  type NodeChange,
  Position,
  ReactFlow,
  type Viewport,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { canvasColors, canvasMetrics } from '#canvas/canvasTokens.js'
import { toFieldConnection, toNodeLayoutChange } from '#canvas/changes.js'
import { FieldEdge, type FieldEdgeType } from '#canvas/FieldEdge/FieldEdge.js'
import { fieldHandleId, liveFieldsByNode, resolveEdgeTone } from '#canvas/fields.js'
import { type JobikFlowNode, JobikNode } from '#canvas/NodeCard/NodeCard.js'
import type { EdgeShape, FlowCanvasEdge, FlowCanvasNode, FlowCanvasProps } from '#canvas/types.js'
import { ZoomControls } from '#canvas/ZoomControls/ZoomControls.js'
import { cx } from '#cx.js'
import { accent } from '#tokens.js'
import s from './FlowCanvas.module.css'

/** Module constants: React Flow requires both maps to be referentially stable. */
const nodeTypes = { jobikNode: JobikNode }
const edgeTypes = { fieldEdge: FieldEdge }

/**
 * `### Layout and metrics`: a 22×22px dot grid in `#191c1f`, offset `-1`.
 *
 * The design draws it as `radial-gradient(var(--dot) 1px, transparent 1px)`, whose hard stop is at
 * a 1px RADIUS — so each dot is 2px across. React Flow's `size` is the dot's DIAMETER: `Background`
 * renders `<circle r={size / 2}>`. Passing `dotRadius` straight through drew the grid at half the
 * design's weight, which is why the doubling is spelled out here rather than in the token.
 */
export const dotGrid = {
  variant: BackgroundVariant.Dots,
  gap: canvasMetrics.dotGridGap,
  size: canvasMetrics.dotRadius * 2,
  offset: canvasMetrics.dotGridOffset,
  color: canvasColors.dotGrid,
} as const

export function toReactFlowNodes(
  nodes: readonly FlowCanvasNode[],
  edges: readonly FlowCanvasEdge[],
  startNodeId?: string,
  selectedNodeId?: string,
): JobikFlowNode[] {
  const live = liveFieldsByNode(edges, startNodeId)
  return nodes.map((node) => ({
    id: node.id,
    type: 'jobikNode' as const,
    position: { x: node.position.x, y: node.position.y },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    selected: node.data.selected ?? node.id === selectedNodeId,
    data: { ...node.data, liveFields: node.data.liveFields ?? live.get(node.id) ?? [] },
  }))
}

/** Where the props last said each node was — the baseline a resync compares against. */
export function nodePositions(
  nodes: readonly FlowCanvasNode[],
): ReadonlyMap<string, { readonly x: number; readonly y: number }> {
  return new Map(nodes.map((node) => [node.id, node.position]))
}

/**
 * The props, folded onto the React Flow state the canvas already holds — instead of replacing it.
 *
 * `rfNodes` carries two things at once: what the document says (which node, where, which fields)
 * and what React Flow is doing right now (the position a gesture is writing, the size it measured).
 * Rebuilding the array threw the second away, so a `nodes` prop that arrived mid-gesture reset the
 * node under the pointer. The model no longer rebuilds that array during a run — `canvas.nodes` is
 * structure only — but the canvas is a component anyone may hand a freshly-built array to, and
 * "must be referentially stable" is not a contract a prop can enforce.
 *
 * So a position is taken from the props only when the props actually MOVED it: `synced` is what
 * they said last time, and a node whose stated position is unchanged keeps the one it is being
 * dragged to. Everything else — selection, the field specs, the handles' sides — is the props' to
 * state, and is taken from `next` every time. A node the canvas has never seen is taken whole.
 *
 * This is what makes `reloadFromDisk` and an in-flight drag both work: the first genuinely changes
 * the stated position and is adopted, the second does not state anything new at all.
 */
export function syncReactFlowNodes(
  current: readonly JobikFlowNode[],
  next: readonly JobikFlowNode[],
  synced: ReadonlyMap<string, { readonly x: number; readonly y: number }>,
): JobikFlowNode[] {
  const held = new Map(current.map((node) => [node.id, node]))
  return next.map((node) => {
    const live = held.get(node.id)
    if (live === undefined) return node
    const was = synced.get(node.id)
    const moved = was === undefined || was.x !== node.position.x || was.y !== node.position.y
    // `{ ...live, ...node }` keeps what only React Flow knows — the measured size, whether a
    // gesture is in flight — and takes back everything the props own.
    return moved ? { ...live, ...node } : { ...live, ...node, position: live.position }
  })
}

/**
 * `### Edges` → stepped: the elbow x is staggered per edge so two parallel runs between the same
 * pair of nodes never overlap their vertical segments — the artboard turns at `336` then `352`,
 * and at `744` then `760`, a 16px step each time. Nothing upstream knows which edges are parallel,
 * so the stagger is derived here from the order the edges arrive in. An edge that states its own
 * `elbowOffset` keeps it.
 */
export function toReactFlowEdges(
  edges: readonly FlowCanvasEdge[],
  startNodeId: string | undefined,
  shape: EdgeShape,
): FieldEdgeType[] {
  const parallel = new Map<string, number>()
  return edges.map((edge) => {
    const pair = `${edge.source}->${edge.target}`
    const index = parallel.get(pair) ?? 0
    parallel.set(pair, index + 1)
    return {
      id: edge.id,
      type: 'fieldEdge' as const,
      source: edge.source,
      target: edge.target,
      sourceHandle: fieldHandleId('source', edge.sourceField),
      targetHandle: fieldHandleId('target', edge.targetField),
      data: {
        tone: resolveEdgeTone(edge, startNodeId),
        shape,
        elbowOffset: edge.elbowOffset ?? index * canvasMetrics.steppedElbowStagger,
      },
    }
  })
}

/** The graph the canvas has just left, kept alive only for the length of its exit. */
interface GraphGhost {
  readonly key: string
  readonly nodes: JobikFlowNode[]
  readonly edges: FieldEdgeType[]
  readonly viewport: Viewport
}

/**
 * How long the ghost may linger, read off its own computed style rather than assumed.
 *
 * `prefers-reduced-motion` zeroes `--jbk-motion-duration-screen`, and an environment with no
 * stylesheet at all — jsdom, and so every test in this package — reports nothing; both answer `0`,
 * so the ghost is dropped on the next tick instead of hanging around invisibly. This is the same
 * measurement `ModalShell` makes for the 120 ms overlay exit.
 */
function exitDurationMs(element: Element): number {
  const declared = globalThis.getComputedStyle?.(element).transitionDuration ?? ''
  const seconds = Number.parseFloat(declared)
  return Number.isFinite(seconds) ? seconds * 1000 : 0
}

/**
 * The graph canvas. Positions live here while a drag is in flight, because React Flow needs to
 * move the node; everything else is props. `onNodeLayoutChange` and `onConnectFields` report the
 * result — persisting either is P14's.
 *
 * **`rfNodes` stays, and stays local, deliberately.** React Flow has to own the node it is moving:
 * a position that lived in an atom would be written on every pointer frame and read back through a
 * render, which is neither what React Flow expects nor what a drag needs. What changed is that the
 * canvas no longer REPLACES that state whenever the `nodes` prop is rebuilt — see
 * {@link syncReactFlowNodes}. Between that and `canvas.nodes` carrying no run state at all, an
 * in-flight drag now survives a streaming run; before, each stream frame rebuilt the array and
 * reset the node under the pointer.
 *
 * It reads no model. The cards do, one node's overlay each, which is where a run reaches the canvas
 * now.
 */
export const FlowCanvas = reatomComponent(function FlowCanvas(props: FlowCanvasProps) {
  const {
    nodes,
    edges,
    startNodeId,
    selectedNodeId,
    onNodeLayoutChange,
    onConnectFields,
    onSelectStart,
  } = props
  const shape = props.edgeShape ?? 'curved'
  const flowId = props.flowId

  /**
   * `4A` Flow switch, the canvas's half of it. The graph layer is put at the artboard's 8px offset
   * with its transition suppressed, and released on the next frame so it eases in over 240ms — see
   * `FlowCanvas.module.css`. Two frames, not one: the browser has to paint the offset before the
   * class comes off, or there is nothing to ease from.
   *
   * The chrome is not in here at all, so "the chrome never moves" holds by construction.
   * `prefers-reduced-motion` zeroes the duration token, and the layer then arrives in one frame.
   */
  const [entering, setEntering] = useState(false)

  useEffect(() => {
    if (flowId === undefined) return
    setEntering(true)
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setEntering(false))
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [flowId])

  /**
   * `4A` Flow switch, the other half: *"The outgoing graph fades and drifts 8 px up, the incoming
   * one arrives from 8 px down."* The artboard's own tile (design 177-183) draws them as two
   * absolutely-positioned layers cross-fading at once, and that is what this is.
   *
   * An exit presupposes the departing graph is still on screen, and the canvas is handed one
   * document at a time — so the props the last commit rendered are kept in {@link shown} and
   * replayed as a ghost layer for the length of the change. The ghost takes no pointer events and
   * is out of the accessibility tree; the live layer mounts and becomes interactive on the same
   * frame it always did.
   *
   * **Rule 04 — *"a transition never delays a result"* — is why nothing here gates the switch.**
   * The new graph is not waiting on the old one to finish leaving; the ghost is a picture that
   * nothing else reads, dropped by a timer that cannot outlive the component.
   */
  const [ghost, setGhost] = useState<GraphGhost | null>(null)
  const [ghostLeaving, setGhostLeaving] = useState(false)
  const ghostElement = useRef<HTMLDivElement | null>(null)
  const viewport = useRef<Viewport>({ x: 0, y: 0, zoom: 1 })
  /** What the props said at the last commit — the graph a switch is leaving behind. */
  const shown = useRef<{
    readonly flowId: string | undefined
    readonly nodes: readonly FlowCanvasNode[]
    readonly edges: readonly FlowCanvasEdge[]
    readonly startNodeId: string | undefined
    readonly selectedNodeId: string | undefined
    readonly shape: EdgeShape
  } | null>(null)

  useEffect(() => {
    if (flowId === undefined) return
    const previous = shown.current
    if (previous === null || previous.flowId === flowId) return
    setGhost({
      key: `${previous.flowId ?? ''}->${flowId}`,
      nodes: toReactFlowNodes(
        previous.nodes,
        previous.edges,
        previous.startNodeId,
        previous.selectedNodeId,
      ),
      edges: toReactFlowEdges(previous.edges, previous.startNodeId, previous.shape),
      viewport: viewport.current,
    })
    setGhostLeaving(false)
  }, [flowId])

  /**
   * Two frames to release it, for the reason the entrance needs two — the layer has to be painted
   * at rest before the class that moves it goes on — then one timer to drop it. The timer is what
   * keeps a ghost from being stranded when no transition ever fires: `prefers-reduced-motion` and
   * jsdom both measure `0`, so the layer leaves on the next tick rather than waiting for a
   * `transitionend` that is never coming.
   */
  useEffect(() => {
    if (ghost === null) return
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setGhostLeaving(true))
    })
    const element = ghostElement.current
    const timer = globalThis.setTimeout(
      () => setGhost(null),
      element === null ? 0 : exitDurationMs(element),
    )
    return () => {
      cancelAnimationFrame(frame)
      globalThis.clearTimeout(timer)
    }
  }, [ghost])

  const [rfNodes, setRfNodes] = useState<JobikFlowNode[]>(() =>
    toReactFlowNodes(nodes, edges, startNodeId, selectedNodeId),
  )

  /**
   * The positions the props stated at the last sync. `null` until the first one, which is the mount
   * — where the state was built from these very nodes, so there is nothing yet to preserve.
   */
  const synced = useRef<ReadonlyMap<string, { readonly x: number; readonly y: number }> | null>(
    null,
  )

  useEffect(() => {
    const next = toReactFlowNodes(nodes, edges, startNodeId, selectedNodeId)
    const previous = synced.current ?? nodePositions(nodes)
    synced.current = nodePositions(nodes)
    setRfNodes((current) => syncReactFlowNodes(current, next, previous))
  }, [nodes, edges, startNodeId, selectedNodeId])

  const rfEdges = useMemo(
    () => toReactFlowEdges(edges, startNodeId, shape),
    [edges, startNodeId, shape],
  )

  // Declared after the ghost effect on purpose: on the commit that changes `flowId`, that effect
  // reads this ref while it still holds the graph the user was looking at, and this one replaces it
  // afterwards. No dependency list, because every commit is a candidate for the next ghost.
  useEffect(() => {
    shown.current = { flowId, nodes, edges, startNodeId, selectedNodeId, shape }
  })

  const onMove = useCallback((_event: unknown, next: Viewport) => {
    viewport.current = next
  }, [])

  const onNodesChange = useCallback((changes: NodeChange<JobikFlowNode>[]) => {
    setRfNodes((current) => applyNodeChanges(changes, current))
  }, [])

  const onNodeDragStop = useCallback(
    (_event: unknown, node: JobikFlowNode) => {
      onNodeLayoutChange?.(toNodeLayoutChange(node))
    },
    [onNodeLayoutChange],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      const request = toFieldConnection(connection)
      if (request !== undefined) onConnectFields?.(request)
    },
    [onConnectFields],
  )

  // A click selects the entry point only on a card that is actually a start — clicking any other
  // node does nothing, since the canvas has no other node-selection affordance today.
  const onNodeClick = useCallback(
    (_event: unknown, node: JobikFlowNode) => {
      if (node.data.isStart === true) onSelectStart?.(node.id)
    },
    [onSelectStart],
  )

  return (
    <div data-testid="flow-canvas" className={s.canvas} style={props.style}>
      {ghost === null ? null : (
        <div
          key={ghost.key}
          ref={ghostElement}
          data-testid="flow-graph-ghost"
          aria-hidden="true"
          className={cx(s.graph, s.ghost, ghostLeaving && s.ghostLeaving)}
        >
          <ReactFlow
            nodes={ghost.nodes}
            edges={ghost.edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultViewport={ghost.viewport}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
            className={s.flow}
          />
        </div>
      )}
      <div
        data-testid="flow-graph"
        data-entering={entering ? 'true' : undefined}
        className={cx(s.graph, entering && s.graphEntering)}
      >
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={onNodeClick}
          onConnect={onConnect}
          onMove={onMove}
          connectionLineStyle={{
            stroke: accent.cssVar,
            strokeWidth: canvasMetrics.edgeStrokeWidth,
          }}
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
          className={s.flow}
        >
          {props.showDotGrid === false ? null : <Background {...dotGrid} />}
          <ZoomControls />
        </ReactFlow>
      </div>
    </div>
  )
}, 'FlowCanvas')
