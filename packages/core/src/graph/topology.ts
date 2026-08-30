/**
 * Kahn's algorithm over the node ids of one flow. Pure: no Zod, no document, no error classes.
 * Internal to `graph/` and not re-exported from the package barrel.
 *
 * The order is deterministic and is part of this module's contract: the queue is seeded with the
 * zero-indegree nodes in `nodeIds` order, and a settled node releases its dependents in the order
 * they appear in its list. Callers pass `nodeIds` in flow-declaration order and build `dependents`
 * in document order, so the same flow and document always produce the same order. That
 * "flow-declaration order" is really the own-key order of `flow.nodes`, so an integer-like id
 * (`'0'`, `'2'`, `'10'`) is enumerated first, in ascending numeric order, regardless of when
 * `.node()` was called for it.
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
 * Find one cycle among the nodes Kahn's algorithm could not settle, and report it closed —
 * `a -> b -> a` is `['a', 'b', 'a']`, and a self-loop is `['a', 'a']`.
 *
 * Depth-first, because a forward walk that always takes the first unsettled dependent is not
 * enough: an unsettled node can have an unsettled dependent that leads away from the cycle and
 * dead-ends, and a walk with no way to back out then reports a path that is neither closed nor a
 * cycle. The search keeps the current path, and the first edge back onto a node already on it
 * closes the cycle.
 *
 * Deterministic: roots are tried in `remaining` order, and each node releases its dependents in
 * the order they appear in its list. `visited` makes it linear — a node that has already been
 * explored without closing a cycle cannot close one on a later attempt either.
 */
function findCycle(
  remaining: readonly string[],
  dependents: ReadonlyMap<string, readonly string[]>,
): readonly string[] {
  const unsettled = new Set(remaining)
  const visited = new Set<string>()
  const path: string[] = []
  const onPath = new Set<string>()

  const walk = (id: string): readonly string[] | undefined => {
    if (onPath.has(id)) return [...path.slice(path.indexOf(id)), id]
    if (visited.has(id)) return undefined
    visited.add(id)
    path.push(id)
    onPath.add(id)
    for (const dependent of dependents.get(id) ?? []) {
      if (!unsettled.has(dependent)) continue
      const cycle = walk(dependent)
      if (cycle !== undefined) return cycle
    }
    path.pop()
    onPath.delete(id)
    return undefined
  }

  for (const id of remaining) {
    const cycle = walk(id)
    if (cycle !== undefined) return cycle
  }
  return remaining
}
