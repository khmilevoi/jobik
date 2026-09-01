import { StartNotFoundError } from '#errors.js'
import type { GraphNode, RunGraph, ValidatedFlowGraph } from './types.js'

/**
 * Narrow a validated graph to the subgraph one selected start can actually execute.
 *
 * That is forward reachability from the start, minus every node the run could not feed. A flow may
 * declare several starts, so a forward-reachable node can carry an input edge from a node that this
 * run never reaches — a join fed by two starts is the everyday case. Such a node can never run: its
 * missing input is decided by the graph and the chosen start, before execution begins and whatever
 * happens during it. Keeping it in the run would make the run claim a node it cannot execute, and
 * the taxonomy has no error for "unreachable from the selected start", so execution could only
 * describe it with a false one. It is dropped here instead, together with everything that then
 * depends on it, and `RunGraph` means what its own doc says: the exact set `run()` executes.
 *
 * `graph.order` is topological, so one pass is enough — every dependency is decided before the node
 * that needs it.
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
  // A start has no inputs, so the dependency test below always keeps it.
  const order: string[] = []
  const nodes = new Map<string, GraphNode>()
  for (const id of graph.order) {
    if (!reachable.has(id)) continue
    const node = graph.nodes.get(id)
    if (node === undefined) continue
    if (!node.dependencies.every((dependency) => nodes.has(dependency))) continue
    order.push(id)
    nodes.set(id, node)
  }

  return { flowName: graph.flowName, startId, start, nodes, order }
}
