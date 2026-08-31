import { StartNotFoundError } from '#errors.js'
import type { GraphNode, RunGraph, ValidatedFlowGraph } from './types.js'

/**
 * Narrow a validated graph to the subgraph one selected start reaches.
 *
 * Reachability is forward reachability, which is what the spec means by "nodes reachable
 * downstream of the selected start". A flow may declare several starts, so a node in the result
 * can carry an input edge from a node that is NOT in the result; `RunGraph.nodes.has()` is how
 * execution detects that, and what it does about it is execution's decision, not this function's.
 */
export function resolveRunGraph(args: {
  graph: ValidatedFlowGraph
  startId: string
}): RunGraph | StartNotFoundError {
  const { graph, startId } = args
  const start = graph.nodes.get(startId)
  if (start === undefined || start.definition.kind !== 'start') {
    return new StartNotFoundError({ startId, available: graph.startIds })
  }

  const reachable = new Set<string>([startId])
  const pending: string[] = [startId]
  while (pending.length > 0) {
    const id = pending.pop()
    if (id === undefined) break
    for (const dependent of graph.nodes.get(id)?.dependents ?? []) {
      if (reachable.has(dependent)) continue
      reachable.add(dependent)
      pending.push(dependent)
    }
  }

  // The whole graph is acyclic and every reachable node is a descendant of the start, so filtering
  // the full order is itself a topological order of the subgraph, and the start is always first.
  const order = graph.order.filter((id) => reachable.has(id))
  const nodes = new Map<string, GraphNode>()
  for (const id of order) {
    const node = graph.nodes.get(id)
    if (node !== undefined) nodes.set(id, node)
  }

  return { flowName: graph.flowName, startId, start, nodes, order }
}
