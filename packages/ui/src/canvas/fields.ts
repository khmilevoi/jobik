import type { CSSProperties } from 'react'
import { accent, px, textColors } from '../tokens.js'
import { canvasColors, canvasMetrics } from './canvasTokens.js'
import type {
  FieldEdgeTone,
  FieldHandleTone,
  FieldTone,
  FlowCanvasEdge,
  HandleDirection,
  NodeFieldSpec,
} from './types.js'
import { RUN_ANNOTATIONS } from './types.js'

const DIM_ANNOTATIONS: readonly string[] = [RUN_ANNOTATIONS.pending, RUN_ANNOTATIONS.waiting]

/**
 * `### Node cards`: during a run the annotation carries state instead of a type. A `pending` or
 * `waiting` row is dimmed; every row on a start node is active; everything else is normal.
 */
export function resolveFieldTone(field: NodeFieldSpec, isStart: boolean): FieldTone {
  if (field.tone !== undefined) return field.tone
  if (DIM_ANNOTATIONS.includes(field.annotation)) return 'dim'
  return isStart ? 'active' : 'normal'
}

export function fieldLabelColor(tone: FieldTone): string {
  if (tone === 'active') return textColors.activeFieldLabel
  if (tone === 'dim') return canvasColors.fieldLabelDim
  return textColors.fieldLabel
}

export function fieldAnnotationColor(tone: FieldTone): string {
  return tone === 'dim' ? canvasColors.annotationDim : textColors.typeAnnotation
}

export function fieldHandleId(direction: HandleDirection, name: string): string {
  return `${direction}:${name}`
}

export function parseFieldHandleId(
  id: string | null | undefined,
): { readonly direction: HandleDirection; readonly name: string } | undefined {
  if (id === null || id === undefined) return undefined
  const separator = id.indexOf(':')
  if (separator < 1) return undefined
  const direction = id.slice(0, separator)
  const name = id.slice(separator + 1)
  if (name === '') return undefined
  if (direction !== 'source' && direction !== 'target') return undefined
  return { direction, name }
}

const handleBorders: Record<FieldHandleTone, string> = {
  accent: accent.cssVar,
  idle: canvasColors.handleIdle,
  dim: canvasColors.handleDim,
}

/** The 8px circle, 1.5px border, offset `-4px` and vertically centred on its row. */
export function fieldHandleStyle(tone: FieldHandleTone, direction: HandleDirection): CSSProperties {
  const offset = px(canvasMetrics.handleOffset)
  return {
    position: 'absolute',
    width: px(canvasMetrics.handleSize),
    height: px(canvasMetrics.handleSize),
    minWidth: px(canvasMetrics.handleSize),
    minHeight: px(canvasMetrics.handleSize),
    borderRadius: '50%',
    background: canvasColors.handleFill,
    border: `${px(canvasMetrics.handleBorderWidth)} solid ${handleBorders[tone]}`,
    top: '50%',
    transform: 'translateY(-50%)',
    ...(direction === 'source' ? { right: offset } : { left: offset }),
  }
}

export function endpointKey(nodeId: string, direction: HandleDirection, field: string): string {
  return `${nodeId}:${direction}:${field}`
}

/** `### Layout and metrics`: accent for edges leaving the selected start, `#2c3236` otherwise. */
export function resolveEdgeTone(edge: FlowCanvasEdge, startNodeId?: string): FieldEdgeTone {
  if (edge.tone !== undefined) return edge.tone
  return edge.source === startNodeId ? 'accent' : 'idle'
}

/** The endpoints of every accent or active edge — the handles the artboards paint accent. */
export function liveEndpointKeys(
  edges: readonly FlowCanvasEdge[],
  startNodeId?: string,
): ReadonlySet<string> {
  const keys = new Set<string>()
  for (const edge of edges) {
    const tone = resolveEdgeTone(edge, startNodeId)
    if (tone !== 'accent' && tone !== 'active') continue
    keys.add(endpointKey(edge.source, 'source', edge.sourceField))
    keys.add(endpointKey(edge.target, 'target', edge.targetField))
  }
  return keys
}

export function resolveHandleTone(
  field: NodeFieldSpec,
  isStart: boolean,
  live: boolean,
): FieldHandleTone {
  if (field.handleTone !== undefined) return field.handleTone
  if (resolveFieldTone(field, isStart) === 'dim') return 'dim'
  return live ? 'accent' : 'idle'
}
