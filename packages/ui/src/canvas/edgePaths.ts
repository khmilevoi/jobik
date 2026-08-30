import type { CSSProperties } from 'react'
import { accent, motion } from '../tokens.js'
import { canvasColors, canvasMetrics } from './canvasTokens.js'
import type { FieldEdgeData, FieldEdgeTone } from './types.js'

export interface FieldEdgeGeometry {
  readonly sourceX: number
  readonly sourceY: number
  readonly targetX: number
  readonly targetY: number
}

/** React Flow hands back sub-pixel coordinates; the artboards are whole numbers. */
function n(value: number): string {
  return String(Math.round(value * 100) / 100)
}

/**
 * The artboard curve: a cubic whose control points both sit on the horizontal midpoint.
 * React Flow's `getBezierPath` uses a different curvature model and does not match.
 */
export function curvedFieldPath(geometry: FieldEdgeGeometry): string {
  const { sourceX, sourceY, targetX, targetY } = geometry
  const mid = (sourceX + targetX) / 2
  return (
    `M${n(sourceX)},${n(sourceY)} C ${n(mid)},${n(sourceY)} ${n(mid)},${n(targetY)} ` +
    `${n(targetX)},${n(targetY)}`
  )
}

/** The orthogonal `stepped` variant: out, across, in. */
export function steppedFieldPath(geometry: FieldEdgeGeometry, elbowOffset = 0): string {
  const { sourceX, sourceY, targetX, targetY } = geometry
  const elbow = (sourceX + targetX) / 2 + elbowOffset
  return `M${n(sourceX)},${n(sourceY)} H${n(elbow)} V${n(targetY)} H${n(targetX)}`
}

export function fieldEdgePath(data: FieldEdgeData, geometry: FieldEdgeGeometry): string {
  return data.shape === 'stepped'
    ? steppedFieldPath(geometry, data.elbowOffset)
    : curvedFieldPath(geometry)
}

export function fieldEdgeStyle(tone: FieldEdgeTone): CSSProperties {
  if (tone === 'active') {
    return {
      stroke: accent.cssVar,
      strokeWidth: canvasMetrics.edgeActiveStrokeWidth,
      strokeDasharray: canvasMetrics.edgeActiveDash,
      animation: motion.edgeDash,
    }
  }
  if (tone === 'waiting') {
    return {
      stroke: canvasColors.edgeWaiting,
      strokeWidth: canvasMetrics.edgeStrokeWidth,
      strokeDasharray: canvasMetrics.edgeWaitingDash,
    }
  }
  return {
    stroke: tone === 'accent' ? accent.cssVar : canvasColors.edgeIdle,
    strokeWidth: canvasMetrics.edgeStrokeWidth,
  }
}
