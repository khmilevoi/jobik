import { BaseEdge, type Edge, type EdgeProps } from '@xyflow/react'
import { fieldEdgeClass, fieldEdgePath } from '#canvas/edgePaths.js'
import type { FieldEdgeData } from '#canvas/types.js'

export type FieldEdgeType = Edge<FieldEdgeData, 'fieldEdge'>

const fallback: FieldEdgeData = { tone: 'idle', shape: 'curved' }

/** The `edgeTypes` entry. Everything it needs travels in `data`, filled by `FlowCanvas`. */
export function FieldEdge(props: EdgeProps<FieldEdgeType>) {
  const data = props.data ?? fallback
  return (
    <BaseEdge
      id={props.id}
      path={fieldEdgePath(data, {
        sourceX: props.sourceX,
        sourceY: props.sourceY,
        targetX: props.targetX,
        targetY: props.targetY,
      })}
      className={fieldEdgeClass(data.tone)}
    />
  )
}
