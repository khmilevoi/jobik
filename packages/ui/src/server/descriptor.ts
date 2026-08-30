import path from 'node:path'
import * as jobik from '@jobik/core'
import type { DiscoveredFlow } from './discovery.js'

/**
 * The safe flow descriptor: everything the browser is allowed to know about a flow.
 *
 * This module is half the wall between the server and the browser. What crosses is node ids, kinds,
 * titles, P6's control descriptors and their type annotations, and the document's FILE NAME. What
 * never crosses is a handler, a Zod schema, an absolute filesystem path or a secret — the
 * `BoundFlow` on the Node side holds all four, and none of them is read here.
 *
 * `documentFile` is a basename, never a directory: the design's top bar shows the flow name beside
 * a mono file badge, and a file name discloses nothing about the filesystem it lives on.
 */

/** One row of the design's `Flows` list. Structurally identical to P4's `FlowSummary`. */
export type SafeFlowSummary = {
  readonly id: string
  readonly name: string
  readonly nodeCount: number
}

/** One node card's static shape. Run state is not here — it arrives on the run stream (P13). */
export type SafeNodeDescriptor = {
  readonly id: string
  readonly kind: jobik.NodeKind
  readonly title: string
  readonly input: jobik.NodeInputDescriptor
  readonly output: jobik.NodeOutputDescriptor
}

export type SafeFlowDescriptor = {
  readonly id: string
  readonly name: string
  /** The document's file name only, e.g. `flow.jobik.json`. Never its directory. */
  readonly documentFile: string
  /** Every node, in the order the flow builder attached it. */
  readonly nodes: readonly SafeNodeDescriptor[]
  /** The ids of the starts, in the same order. */
  readonly startIds: readonly string[]
}

export function summariseFlow(discovered: DiscoveredFlow): SafeFlowSummary {
  return {
    id: discovered.id,
    name: discovered.flow.name,
    nodeCount: Object.keys(discovered.flow.nodes).length,
  }
}

/**
 * Derive the descriptor, or return the first `JobUiSchemaError` P6 reports — as a value. An
 * inaccurate editor form is never produced, so a flow with one unrepresentable schema fails to
 * load rather than rendering a lie.
 */
export function describeFlow(
  discovered: DiscoveredFlow,
): SafeFlowDescriptor | jobik.JobUiSchemaError {
  const nodes: SafeNodeDescriptor[] = []
  const startIds: string[] = []

  for (const [id, definition] of Object.entries(discovered.flow.nodes)) {
    const input = jobik.deriveInputControls({ nodeId: id, input: definition.input })
    if (input instanceof Error) return input

    // A start has no output schema: its validated input becomes its output fields.
    const outputSchema = definition.kind === 'start' ? definition.input : definition.output
    const output = jobik.deriveOutputFields({ nodeId: id, output: outputSchema })
    if (output instanceof Error) return output

    nodes.push({ id, kind: definition.kind, title: definition.title, input, output })
    if (definition.kind === 'start') startIds.push(id)
  }

  return {
    id: discovered.id,
    name: discovered.flow.name,
    documentFile: path.basename(discovered.documentPath),
    nodes,
    startIds,
  }
}
