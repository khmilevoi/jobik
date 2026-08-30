import type * as z from 'zod'
import type { FlowDocument } from '../document/schema.js'
import { ConnectionError, type FieldRef } from '../errors.js'
import type { BoundFlow } from '../flow.js'
import type { AnyDefinition } from '../node.js'
import { areFieldTypesCompatible, fieldTypeOf, isRequiredField } from './field-type.js'
import { topologicalOrder } from './topology.js'
import type { GraphInputEdge, GraphNode, ValidatedFlowGraph } from './types.js'

/**
 * Bind a parsed flow document to a bound flow.
 *
 * The document is data and the flow is code: every node id and field name in the document is
 * untrusted, so ids are resolved through a `Map` and field names through `Object.hasOwn`. The
 * checks run in a fixed order — connections in document order, then cycles, then literals — and
 * the first problem is returned, because the taxonomy carries one `ConnectionError` and not a list.
 * The document's `layout` is editor state and is deliberately not validated.
 */
export function validateFlowGraph(args: {
  flow: BoundFlow
  document: FlowDocument
}): ValidatedFlowGraph | ConnectionError {
  const { flow, document } = args
  const definitions = new Map<string, AnyDefinition>(Object.entries(flow.nodes))
  const nodeIds = [...definitions.keys()]

  const inputs = new Map<string, GraphInputEdge[]>(nodeIds.map((id) => [id, []]))
  const dependencies = new Map<string, string[]>(nodeIds.map((id) => [id, []]))
  const dependents = new Map<string, string[]>(nodeIds.map((id) => [id, []]))
  const connected = new Set<string>()

  for (const { from, to } of document.connections) {
    const source = definitions.get(from.node)
    if (source === undefined) {
      return connectionError(`connection source node '${from.node}' does not exist`, from, to)
    }
    const target = definitions.get(to.node)
    if (target === undefined) {
      return connectionError(`connection target node '${to.node}' does not exist`, from, to)
    }
    if (target.kind === 'start') {
      return connectionError(
        `node '${to.node}' is a start: its input comes from run(startId, input), not from a connection`,
        from,
        to,
      )
    }
    const sourceShape = outputShapeOf(source)
    if (!Object.hasOwn(sourceShape, from.field)) {
      return connectionError(`node '${from.node}' has no output field '${from.field}'`, from, to)
    }
    const targetShape = target.input.shape
    if (!Object.hasOwn(targetShape, to.field)) {
      return connectionError(`node '${to.node}' has no input field '${to.field}'`, from, to)
    }

    const fromKind = fieldTypeOf(sourceShape[from.field], 'output')
    const toKind = fieldTypeOf(targetShape[to.field], 'input')
    if (!areFieldTypesCompatible(fromKind, toKind)) {
      return connectionError(
        `cannot connect ${fromKind} '${from.node}.${from.field}' to ${toKind} '${to.node}.${to.field}'`,
        from,
        to,
      )
    }

    const slot = fieldKey(to.node, to.field)
    if (connected.has(slot)) {
      return connectionError(
        `input field '${to.node}.${to.field}' already has an incoming connection`,
        from,
        to,
      )
    }

    connected.add(slot)
    inputs.get(to.node)?.push({ field: to.field, from: { node: from.node, field: from.field } })
    pushUnique(dependencies, to.node, from.node)
    pushUnique(dependents, from.node, to.node)
  }

  const sorted = topologicalOrder(nodeIds, dependents)
  if (sorted.kind === 'cycle') {
    return new ConnectionError({
      reason: `the graph contains a cycle: ${sorted.cycle.join(' -> ')}`,
      cycle: sorted.cycle,
    })
  }

  for (const [nodeId, values] of Object.entries(document.literals)) {
    const definition = definitions.get(nodeId)
    if (definition === undefined) {
      return new ConnectionError({
        reason: `literals reference node '${nodeId}', which does not exist`,
      })
    }
    if (definition.kind === 'start') {
      return new ConnectionError({
        reason: `node '${nodeId}' is a start: its input comes from run(startId, input), so it takes no literals`,
      })
    }
    const shape = definition.input.shape
    for (const field of Object.keys(values)) {
      if (!Object.hasOwn(shape, field)) {
        return new ConnectionError({
          reason: `node '${nodeId}' has no input field '${field}', so it cannot take a literal for it`,
          to: { node: nodeId, field },
        })
      }
      if (connected.has(fieldKey(nodeId, field))) {
        return new ConnectionError({
          reason: `input field '${nodeId}.${field}' is connected, so it cannot also take a literal`,
          to: { node: nodeId, field },
        })
      }
    }
  }

  for (const [nodeId, definition] of definitions) {
    if (definition.kind === 'start') continue
    const values = Object.hasOwn(document.literals, nodeId) ? document.literals[nodeId] : {}
    for (const [field, schema] of Object.entries(definition.input.shape)) {
      if (connected.has(fieldKey(nodeId, field))) continue
      if (Object.hasOwn(values, field)) continue
      if (!isRequiredField(schema)) continue
      return new ConnectionError({
        reason: `required input field '${nodeId}.${field}' is neither connected nor given a literal`,
        to: { node: nodeId, field },
      })
    }
  }

  const nodes = new Map<string, GraphNode>()
  for (const [id, definition] of definitions) {
    nodes.set(id, {
      id,
      definition,
      inputs: inputs.get(id) ?? [],
      literals: literalsOf(document, id, definition),
      dependencies: dependencies.get(id) ?? [],
      dependents: dependents.get(id) ?? [],
    })
  }

  return {
    flowName: flow.name,
    nodes,
    order: sorted.order,
    startIds: nodeIds.filter((id) => definitions.get(id)?.kind === 'start'),
  }
}

/** A start has no output schema: its validated run input becomes its output fields. */
function outputShapeOf(definition: AnyDefinition): Record<string, z.core.$ZodType> {
  return definition.kind === 'start' ? definition.input.shape : definition.output.shape
}

/**
 * A slot key for one input field. Safe because both arguments are already proven by the checks
 * above to be a node id declared in code and a field name declared in a Zod schema, not arbitrary
 * document strings — the separator alone would not prevent a collision.
 */
function fieldKey(nodeId: string, field: string): string {
  return `${nodeId}\u0000${field}`
}

function pushUnique(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key)
  if (list !== undefined && !list.includes(value)) list.push(value)
}

/** A shallow copy, so a later edit to the document cannot reach into a built graph. */
function literalsOf(
  document: FlowDocument,
  nodeId: string,
  definition: AnyDefinition,
): Readonly<Record<string, unknown>> {
  if (definition.kind === 'start') return {}
  if (!Object.hasOwn(document.literals, nodeId)) return {}
  return { ...document.literals[nodeId] }
}

function connectionError(reason: string, from: FieldRef, to: FieldRef): ConnectionError {
  return new ConnectionError({ reason, from: { ...from }, to: { ...to } })
}
