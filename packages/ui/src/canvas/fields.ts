import { cx } from '#cx.js'
import s from './fields.module.css'
import type {
  FieldEdgeTone,
  FieldHandleTone,
  FieldProblem,
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

/** Spelled out in full, never indexed by a computed key — see `cssModuleUsage.test.ts`. */
const labelTones = {
  active: s.labelActive,
  normal: s.labelNormal,
  dim: s.labelDim,
} satisfies Record<FieldTone, string>

const annotationTones = {
  active: s.annotationNormal,
  normal: s.annotationNormal,
  dim: s.annotationDim,
} satisfies Record<FieldTone, string>

/**
 * `3D` — only the receiving port of a mismatch brightens its label. The other two marks keep the
 * ordinary one: `publish.caption` (no source) and `start1.markdown` (the sending end) are both
 * `#aab1b7`/`#c3c9ce` on the artboard, marked by their annotation and their handle alone.
 */
const labelProblems = {
  mismatch: s.labelProblem,
  linked: '',
  unsourced: '',
} satisfies Record<FieldProblem, string>

/** All three recolour the annotation — `string ≠ Buffer`, `Buffer` and `no source` are one hue. */
const annotationProblems = {
  mismatch: s.annotationProblem,
  linked: s.annotationProblem,
  unsourced: s.annotationProblem,
} satisfies Record<FieldProblem, string>

/** The one place the marks split: a port with no source draws a dashed ring, not a solid one. */
const handleProblems = {
  mismatch: s.handleProblem,
  linked: s.handleProblem,
  unsourced: s.handleUnsourced,
} satisfies Record<FieldProblem, string>

export function fieldLabelClass(tone: FieldTone, problem?: FieldProblem): string {
  if (problem !== undefined) return cx(labelTones[tone], labelProblems[problem])
  return labelTones[tone]
}

export function fieldAnnotationClass(tone: FieldTone, problem?: FieldProblem): string {
  if (problem !== undefined) return annotationProblems[problem]
  return annotationTones[tone]
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

const handleTones = {
  accent: s.handleAccent,
  idle: s.handleIdle,
  dim: s.handleDim,
} satisfies Record<FieldHandleTone, string>

const handleEdges = {
  source: s.handleSource,
  target: s.handleTarget,
} satisfies Record<HandleDirection, string>

/** The 8px circle, 1.5px border, offset `-4px` and vertically centred on its row. */
export function fieldHandleClass(
  tone: FieldHandleTone,
  direction: HandleDirection,
  problem?: FieldProblem,
): string {
  return cx(
    s.handle,
    handleTones[tone],
    handleEdges[direction],
    problem !== undefined && handleProblems[problem],
  )
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

/**
 * The accent handle ids on each node, keyed by node id — what `NodeCardData.liveFields` carries.
 */
export function liveFieldsByNode(
  edges: readonly FlowCanvasEdge[],
  startNodeId?: string,
): ReadonlyMap<string, readonly string[]> {
  const live = liveEndpointKeys(edges, startNodeId)
  const byNode = new Map<string, string[]>()

  const add = (nodeId: string, direction: HandleDirection, field: string): void => {
    if (!live.has(endpointKey(nodeId, direction, field))) return
    const handleId = fieldHandleId(direction, field)
    const list = byNode.get(nodeId) ?? []
    if (!list.includes(handleId)) list.push(handleId)
    byNode.set(nodeId, list)
  }

  for (const edge of edges) {
    add(edge.source, 'source', edge.sourceField)
    add(edge.target, 'target', edge.targetField)
  }
  return byNode
}
