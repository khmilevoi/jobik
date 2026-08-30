import type { Connection } from '@xyflow/react'
import { parseFieldHandleId } from './fields.js'
import type { FieldConnection, NodeLayoutChange } from './types.js'

/** A layout drag, reduced to what P14 has to persist. */
export function toNodeLayoutChange(node: {
  readonly id: string
  readonly position: { readonly x: number; readonly y: number }
}): NodeLayoutChange {
  return { nodeId: node.id, position: { x: node.position.x, y: node.position.y } }
}

/**
 * A completed connection, reduced to the two field endpoints. Returns `undefined` for anything
 * that did not land on one of our field handles, so the canvas emits nothing rather than
 * something malformed.
 */
export function toFieldConnection(connection: Connection): FieldConnection | undefined {
  const source = parseFieldHandleId(connection.sourceHandle)
  const target = parseFieldHandleId(connection.targetHandle)
  if (source === undefined || target === undefined) return undefined
  if (source.direction !== 'source' || target.direction !== 'target') return undefined
  return {
    source: connection.source,
    sourceField: source.name,
    target: connection.target,
    targetField: target.name,
  }
}
