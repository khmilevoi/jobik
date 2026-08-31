import path from 'node:path'
import type * as z from 'zod'
import type { AnyDefinition, AnyNodeDefinition, AnyStartDefinition } from './node.js'
import { runFlow } from './run/run.js'
import type { RunOptions, RunReport, RunStartError } from './run/types.js'

/**
 * The flow builder.
 *
 * `flow(name)` starts a chain; each `.start()` / `.node()` returns a NEW builder carrying one more
 * entry in its `Nodes` type parameter; `.bind()` closes the chain. The builder assigns the only id
 * a definition ever has. P9 widens what `bind()` returns to add `run(startId, input)`.
 */

/** Every attached definition, keyed by the id the builder assigned. */
export type FlowNodes = Readonly<Record<string, AnyDefinition>>

/**
 * What an author says about a flow that the graph itself cannot say.
 *
 * Every field is optional, none of it reaches execution — `run/` never reads this — and the bag is
 * open by intent: it is where a declaration that only a surface cares about goes, rather than a
 * parameter on `flow()` that every caller would have to pass.
 */
export type FlowMeta = {
  /**
   * The module this flow is authored in. Pass `import.meta.filename`; an absolute path is
   * required, for the same reason `bind('path', …)` requires one.
   *
   * It exists because the editor shows the file a flow is *written* in, and a bound flow only
   * knows the JSON document it is bound to. Node-only: a server sends a browser this path's
   * BASENAME and never the directory it sits in.
   *
   * Leave it out and a surface falls back to whatever it already knows — for the Studio, the
   * binding entrypoint's own file name.
   */
  readonly source?: string
}

/** Turns a re-used id into a self-describing compile error instead of a silent overwrite. */
export type FreshNodeId<Id extends string, Nodes extends FlowNodes> = Id extends keyof Nodes
  ? `duplicate node id: ${Id}`
  : Id

/** A flow with its storage bound. */
export interface BoundFlow<Nodes extends FlowNodes = FlowNodes> {
  readonly name: string
  readonly path: string
  readonly nodes: Nodes
  /**
   * What `.meta()` declared, or `undefined` when it was never called. Optional rather than
   * defaulted to `{}` so the two are distinguishable, and because a module loaded off disk is
   * untrusted: a hand-built object that satisfies this interface structurally may carry no `meta`
   * at all, and every reader must cope with that anyway.
   */
  readonly meta?: FlowMeta

  /**
   * Run one start over the current document. Method syntax, not a property, and deliberately so:
   * a method keeps its parameters bivariant, which is what keeps `BoundFlow<Specific>` assignable
   * to `BoundFlow` — `validateFlowGraph` takes the loose bound. A property typed as a function
   * would be checked contravariantly and would break every existing caller.
   */
  run<Id extends StartIdOf<Nodes>>(
    startId: Id,
    input: StartInputOf<Nodes, Id>,
    options?: RunOptions,
  ): Promise<RunReport | RunStartError>
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

  /**
   * Declare what the graph cannot say. Callable anywhere in the chain and more than once — a
   * later call merges over an earlier one field by field, because this is an accumulating
   * declaration rather than an id that a second use would silently overwrite.
   */
  meta(meta: FlowMeta): FlowBuilder<Nodes>

  bind(kind: 'path', value: string): BoundFlow<Nodes>
}

function createBuilder(
  name: string,
  nodes: Readonly<Record<string, AnyDefinition>>,
  meta: FlowMeta | undefined,
) {
  const attach = (id: string, definition: AnyDefinition) => {
    if (Object.hasOwn(nodes, id)) {
      throw new TypeError(`jobik.flow('${name}'): node id '${id}' is already used`)
    }
    return createBuilder(name, { ...nodes, [id]: definition }, meta)
  }

  const builder = {
    start: (id: string, definition: AnyStartDefinition) => attach(id, definition),
    node: (id: string, definition: AnyNodeDefinition) => attach(id, definition),
    meta: (next: FlowMeta) => {
      if (next.source !== undefined && !path.isAbsolute(next.source)) {
        throw new TypeError(
          `jobik.flow('${name}'): meta({ source }) requires an absolute path, received '${next.source}'`,
        )
      }
      return createBuilder(name, nodes, { ...meta, ...next })
    },
    bind: (kind: 'path', value: string): BoundFlow => {
      if (!path.isAbsolute(value)) {
        throw new TypeError(
          `jobik.flow('${name}'): bind('${kind}', ...) requires an absolute path, received '${value}'`,
        )
      }
      const bound: BoundFlow = {
        name,
        path: value,
        nodes: { ...nodes },
        // Spread rather than assigned, so a flow that never declared anything carries no `meta`
        // key at all — `{ source: undefined }` and "never declared" are not the same answer.
        ...(meta === undefined ? {} : { meta: { ...meta } }),
        run: (startId: string, input: unknown, options?: RunOptions) =>
          runFlow({ flow: bound, startId, input, options }),
      }
      return bound
    },
  }

  return builder as unknown as FlowBuilder<FlowNodes>
}

/** Open a builder chain. The name identifies the flow in the editor and in run reports. */
export function flow(name: string): FlowBuilder<Record<never, never>> {
  return createBuilder(name, {}, undefined) as FlowBuilder<Record<never, never>>
}

/** Every id attached to this flow. */
export type NodeIdOf<Nodes extends FlowNodes> = keyof Nodes & string

/** The ids of the starts only. A flow may declare any number of them. */
export type StartIdOf<Nodes extends FlowNodes> = {
  [K in keyof Nodes]: Nodes[K] extends AnyStartDefinition ? K : never
}[keyof Nodes] &
  string

export type InputSchemaOf<Nodes extends FlowNodes, Id extends NodeIdOf<Nodes>> = Nodes[Id] extends {
  readonly input: infer S extends z.ZodObject
}
  ? S
  : never

/** A start has no output schema: its validated input becomes its output fields. */
export type OutputSchemaOf<
  Nodes extends FlowNodes,
  Id extends NodeIdOf<Nodes>,
> = Nodes[Id] extends {
  readonly output: infer S extends z.ZodObject
}
  ? S
  : Nodes[Id] extends { readonly input: infer S extends z.ZodObject }
    ? S
    : never

export type InputFieldOf<Nodes extends FlowNodes, Id extends NodeIdOf<Nodes>> = keyof InputSchemaOf<
  Nodes,
  Id
>['shape'] &
  string

export type OutputFieldOf<
  Nodes extends FlowNodes,
  Id extends NodeIdOf<Nodes>,
> = keyof OutputSchemaOf<Nodes, Id>['shape'] & string

/** What a caller hands `run(startId, input)`: pre-validation, so `z.input`. */
export type StartInputOf<Nodes extends FlowNodes, Id extends StartIdOf<Nodes>> = z.input<
  InputSchemaOf<Nodes, Id & NodeIdOf<Nodes>>
>

/** What a node produced: post-validation, so `z.output`. */
export type NodeOutputOf<Nodes extends FlowNodes, Id extends NodeIdOf<Nodes>> = z.output<
  OutputSchemaOf<Nodes, Id>
>
