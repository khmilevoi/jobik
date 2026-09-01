import type { FieldRef } from '#errors.js'
import type { AnyDefinition } from '#node.js'

/** One incoming connection, seen from the consuming node: which of its input fields, fed by what. */
export type GraphInputEdge = { readonly field: string; readonly from: FieldRef }

/** Everything execution needs about one node of a validated flow. */
export type GraphNode = {
  readonly id: string
  readonly definition: AnyDefinition
  /** Incoming connections in document order. Always empty for a start. */
  readonly inputs: readonly GraphInputEdge[]
  /** Literal values for this node's unconnected input fields. Always empty for a start. */
  readonly literals: Readonly<Record<string, unknown>>
  /**
   * Distinct upstream node ids, ordered by first appearance in the document. In a `RunGraph` every
   * id here names a node of that same run graph — see `RunGraph`.
   */
  readonly dependencies: readonly string[]
  /** Distinct downstream node ids, ordered by first appearance in the document. */
  readonly dependents: readonly string[]
}

/** A document bound to a flow: every connection resolved, no cycles, literals accounted for. */
export type ValidatedFlowGraph = {
  readonly flowName: string
  readonly nodes: ReadonlyMap<string, GraphNode>
  /** Topological order of every node in the flow. */
  readonly order: readonly string[]
  /** Every start id, in flow-declaration order — except an integer-like id, enumerated numerically first. */
  readonly startIds: readonly string[]
}

/** One selected start's reachable subgraph — the exact set `run()` executes, in the order it runs. */
export type RunGraph = {
  readonly flowName: string
  readonly startId: string
  readonly start: GraphNode
  /**
   * The executable nodes only, and closed under `dependencies`: every node here has every node it
   * needs here too. A forward-reachable node fed by a second start is therefore absent, because
   * nothing in this run could ever produce that input — see `resolveRunGraph`.
   */
  readonly nodes: ReadonlyMap<string, GraphNode>
  /** Topological order of the reachable subgraph. The start is always first. */
  readonly order: readonly string[]
}
