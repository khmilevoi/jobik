/**
 * Kahn's algorithm over the node ids of one flow. Pure: no Zod, no document, no error classes.
 * Internal to `graph/` and not re-exported from the package barrel.
 *
 * The order is deterministic and is part of this module's contract: the queue is seeded with the
 * zero-indegree nodes in `nodeIds` order, and a settled node releases its dependents in the order
 * they appear in its list. Callers pass `nodeIds` in flow-declaration order and build `dependents`
 * in document order, so the same flow and document always produce the same order.
 */

export type TopologicalResult =
  | { readonly kind: 'order'; readonly order: readonly string[] }
  | { readonly kind: 'cycle'; readonly cycle: readonly string[] }

export function topologicalOrder(
  nodeIds: readonly string[],
  dependents: ReadonlyMap<string, readonly string[]>,
): TopologicalResult {
  const indegree = new Map<string, number>(nodeIds.map((id) => [id, 0]))
  for (const id of nodeIds) {
    for (const dependent of dependents.get(id) ?? []) {
      indegree.set(dependent, (indegree.get(dependent) ?? 0) + 1)
    }
  }

  const queue = nodeIds.filter((id) => indegree.get(id) === 0)
  const order: string[] = []
  while (queue.length > 0) {
    const id = queue.shift()
    if (id === undefined) break
    order.push(id)
    for (const dependent of dependents.get(id) ?? []) {
      const remaining = (indegree.get(dependent) ?? 0) - 1
      indegree.set(dependent, remaining)
      if (remaining === 0) queue.push(dependent)
    }
  }

  if (order.length === nodeIds.length) return { kind: 'order', order }

  const settled = new Set(order)
  return {
    kind: 'cycle',
    cycle: findCycle(
      nodeIds.filter((id) => !settled.has(id)),
      dependents,
    ),
  }
}

/**
 * Walk forward from the first unsettled node, following one unsettled dependent at a time, until a
 * node repeats. Every unsettled node has at least one unsettled dependent — a node settles only
 * once all of its dependencies have — so the walk always closes; the `remaining` fallback is a
 * guard for a caller that passed an inconsistent map, not a reachable branch.
 */
function findCycle(
  remaining: readonly string[],
  dependents: ReadonlyMap<string, readonly string[]>,
): readonly string[] {
  const unsettled = new Set(remaining)
  const seenAt = new Map<string, number>()
  const path: string[] = []
  let current: string | undefined = remaining[0]
  while (current !== undefined && !seenAt.has(current)) {
    seenAt.set(current, path.length)
    path.push(current)
    current = (dependents.get(current) ?? []).find((id) => unsettled.has(id))
  }
  if (current === undefined) return remaining
  return [...path.slice(seenAt.get(current) ?? 0), current]
}
