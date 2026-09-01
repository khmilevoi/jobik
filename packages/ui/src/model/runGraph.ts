import type { FlowDocument } from '@jobik/core'

/**
 * F06 — the nodes one selected start can actually execute, as core's `resolveRunGraph` decides it.
 *
 * A flow may declare several starts, and `pokedex` does: `card`'s pipeline and `roster`'s share a
 * document and a canvas and not one node. Seeding the session with every node in the flow therefore
 * painted the other pipeline `queued` for the length of a run that was never going to touch it, and
 * left it queued inside the settled report — `rank` reading `Waiting on roster.names` under a run
 * that had already finished, and, on a failure, a truthfully `skipped` node sitting beside a
 * `queued` one: two words for *did not run*, of which only one was true. Nothing on the wire ever
 * agreed, and `run-started`'s `nodeCount` — until now only the progress denominator — is the check.
 *
 * Two rules, both core's. Forward reachability from the start; then, because a forward-reachable
 * node can still carry an input edge from a node this run never reaches, every such node is dropped
 * along with everything below it. Core settles the second in one pass over a topological order the
 * browser has no equivalent of, so it runs here as a fixpoint instead — same set, no order needed.
 *
 * The document to ask is `savedDocument`: the server executes what is on disk, and a dirty draft
 * does not block a run. An unsaved edit moves the canvas, not the run.
 *
 * **This is a second implementation of `resolveRunGraph`, and the duplication is forced.** That
 * function takes a `ValidatedFlowGraph`, which is built from the authored `BoundFlow` and its Zod
 * schemas; the browser has the document and nothing else. So the rule is restated here, and
 * `runGraph.test.ts` beside it is what holds the two together — it runs both against the same
 * flows and asserts the node id sets are equal, rather than against a list written by hand. Change
 * either side and that test is where it shows.
 *
 * It has no Reatom in it and never will: it is a pure function of a document and a start id, which
 * is why it is a module of its own rather than a unit on `RunModel`. It is not on the package
 * barrel — `model/run.ts` is its only caller.
 */
export function runGraphNodeIds(document: FlowDocument, startId: string): ReadonlySet<string> {
  const reachable = new Set<string>([startId])
  const pending = [startId]
  while (pending.length > 0) {
    const from = pending.pop()
    for (const connection of document.connections) {
      if (connection.from.node !== from) continue
      if (reachable.has(connection.to.node)) continue
      reachable.add(connection.to.node)
      pending.push(connection.to.node)
    }
  }

  let dropped = true
  while (dropped) {
    dropped = false
    for (const connection of document.connections) {
      if (!reachable.has(connection.to.node)) continue
      if (reachable.has(connection.from.node)) continue
      reachable.delete(connection.to.node)
      dropped = true
    }
  }

  return reachable
}
