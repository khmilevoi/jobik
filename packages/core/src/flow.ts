import path from 'node:path'
import type { AnyDefinition, AnyNodeDefinition, AnyStartDefinition } from './node.js'

/**
 * The flow builder.
 *
 * `flow(name)` starts a chain; each `.start()` / `.node()` returns a NEW builder carrying one more
 * entry in its `Nodes` type parameter; `.bind()` closes the chain. The builder assigns the only id
 * a definition ever has. P9 widens what `bind()` returns to add `run(startId, input)`.
 */

/** Every attached definition, keyed by the id the builder assigned. */
export type FlowNodes = Readonly<Record<string, AnyDefinition>>

/** Turns a re-used id into a self-describing compile error instead of a silent overwrite. */
export type FreshNodeId<Id extends string, Nodes extends FlowNodes> = Id extends keyof Nodes
  ? `duplicate node id: ${Id}`
  : Id

/** A flow with its storage bound. P9 adds `run()` to this interface. */
export interface BoundFlow<Nodes extends FlowNodes = FlowNodes> {
  readonly name: string
  readonly path: string
  readonly nodes: Nodes
}

export interface FlowBuilder<Nodes extends FlowNodes> {
  start<Id extends string, Definition extends AnyStartDefinition>(
    id: FreshNodeId<Id, Nodes>,
    definition: Definition,
  ): FlowBuilder<Nodes & { readonly [K in Id]: Definition }>

  node<Id extends string, Definition extends AnyNodeDefinition>(
    id: FreshNodeId<Id, Nodes>,
    definition: Definition,
  ): FlowBuilder<Nodes & { readonly [K in Id]: Definition }>

  bind(kind: 'path', value: string): BoundFlow<Nodes>
}

function createBuilder(name: string, nodes: Readonly<Record<string, AnyDefinition>>) {
  const attach = (id: string, definition: AnyDefinition) => {
    if (Object.hasOwn(nodes, id)) {
      throw new TypeError(`jobik.flow('${name}'): node id '${id}' is already used`)
    }
    return createBuilder(name, { ...nodes, [id]: definition })
  }

  const builder = {
    start: (id: string, definition: AnyStartDefinition) => attach(id, definition),
    node: (id: string, definition: AnyNodeDefinition) => attach(id, definition),
    bind: (kind: 'path', value: string): BoundFlow => {
      if (!path.isAbsolute(value)) {
        throw new TypeError(
          `jobik.flow('${name}'): bind('${kind}', ...) requires an absolute path, received '${value}'`,
        )
      }
      return { name, path: value, nodes: { ...nodes } }
    },
  }

  return builder as unknown as FlowBuilder<FlowNodes>
}

/** Open a builder chain. The name identifies the flow in the editor and in run reports. */
export function flow(name: string): FlowBuilder<Record<never, never>> {
  return createBuilder(name, {}) as FlowBuilder<Record<never, never>>
}
