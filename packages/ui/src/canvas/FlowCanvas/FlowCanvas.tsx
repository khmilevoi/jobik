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
import { accent } from '../../tokens.js'
import { canvasColors, canvasMetrics } from '../canvasTokens.js'
import { toFieldConnection, toNodeLayoutChange } from '../changes.js'
import { FieldEdge, type FieldEdgeType } from '../FieldEdge/FieldEdge.js'
import { fieldHandleId, liveFieldsByNode, resolveEdgeTone } from '../fields.js'
import { type JobikFlowNode, JobikNode } from '../NodeCard/NodeCard.js'
import type { EdgeShape, FlowCanvasEdge, FlowCanvasNode, FlowCanvasProps } from '../types.js'
import { ZoomControls } from '../ZoomControls/ZoomControls.js'
import s from './FlowCanvas.module.css'

/** Module constants: React Flow requires both maps to be referentially stable. */
const nodeTypes = { jobikNode: JobikNode }
const edgeTypes = { fieldEdge: FieldEdge }

/** `### Layout and metrics`: a 22×22px dot grid, `#191c1f` 1px dots, offset `-1`. */
export const dotGrid = {
  variant: BackgroundVariant.Dots,
  gap: canvasMetrics.dotGridGap,
  size: canvasMetrics.dotRadius,
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

export function toReactFlowEdges(
  edges: readonly FlowCanvasEdge[],
  startNodeId: string | undefined,
  shape: EdgeShape,
): FieldEdgeType[] {
  return edges.map((edge) => ({
    id: edge.id,
    type: 'fieldEdge' as const,
    source: edge.source,
    target: edge.target,
    sourceHandle: fieldHandleId('source', edge.sourceField),
    targetHandle: fieldHandleId('target', edge.targetField),
    data: {
      tone: resolveEdgeTone(edge, startNodeId),
      shape,
      elbowOffset: edge.elbowOffset,
    },
  }))
}

/**
 * The graph canvas. Positions live here while a drag is in flight, because React Flow needs to
 * move the node; everything else is props. `onNodeLayoutChange` and `onConnectFields` report the
 * result — persisting either is P14's.
 */
export function FlowCanvas(props: FlowCanvasProps) {
  const { nodes, edges, startNodeId, selectedNodeId, onNodeLayoutChange, onConnectFields } = props
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

  return (
    <div data-testid="flow-canvas" className={s.canvas} style={props.style}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
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
