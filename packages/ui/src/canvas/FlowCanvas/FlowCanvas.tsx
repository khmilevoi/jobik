import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  type Connection,
  type NodeChange,
  Position,
  ReactFlow,
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { canvasColors, canvasMetrics } from '#canvas/canvasTokens.js'
import { toFieldConnection, toNodeLayoutChange } from '#canvas/changes.js'
import { FieldEdge, type FieldEdgeType } from '#canvas/FieldEdge/FieldEdge.js'
import { fieldHandleId, liveFieldsByNode, resolveEdgeTone } from '#canvas/fields.js'
import { type JobikFlowNode, JobikNode } from '#canvas/NodeCard/NodeCard.js'
import type { EdgeShape, FlowCanvasEdge, FlowCanvasNode, FlowCanvasProps } from '#canvas/types.js'
import { ZoomControls } from '#canvas/ZoomControls/ZoomControls.js'
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

/**
 * The graph canvas. Positions live here while a drag is in flight, because React Flow needs to
 * move the node; everything else is props. `onNodeLayoutChange` and `onConnectFields` report the
 * result — persisting either is P14's.
 */
export function FlowCanvas(props: FlowCanvasProps) {
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

  const [rfNodes, setRfNodes] = useState<JobikFlowNode[]>(() =>
    toReactFlowNodes(nodes, edges, startNodeId, selectedNodeId),
  )

  useEffect(() => {
    setRfNodes(toReactFlowNodes(nodes, edges, startNodeId, selectedNodeId))
  }, [nodes, edges, startNodeId, selectedNodeId])

  const rfEdges = useMemo(
    () => toReactFlowEdges(edges, startNodeId, shape),
    [edges, startNodeId, shape],
  )

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
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onConnect={onConnect}
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
  )
}
