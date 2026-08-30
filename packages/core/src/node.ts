import type * as z from 'zod'

/**
 * Node and start definitions.
 *
 * A definition is a reusable code value with NO runtime id. The flow builder assigns the only id a
 * node ever has, when it attaches the definition — see `flow.ts`. The same definition may be
 * attached to two ids, in two flows.
 */

/** Editor grouping only. It affects neither binding, nor validation, nor execution. */
export type NodeKind = 'start' | 'transform' | 'sink'

/**
 * The second argument every handler receives. P9 owns how it is populated and may add fields; P2
 * declares only the abort signal, which the spec's cancellation behaviour requires.
 */
export type NodeRunContext = { readonly signal: AbortSignal }

/** Expected failures come back as values: a handler returns `Error`, it does not throw one. */
export type NodeHandler<Input extends z.ZodObject, Output extends z.ZodObject> = (
  input: z.output<Input>,
  context: NodeRunContext,
) => z.input<Output> | Error | Promise<z.input<Output> | Error>

/** A start: an input schema and no handler. Its validated input becomes its output fields. */
export type StartDefinition<Input extends z.ZodObject = z.ZodObject> = {
  readonly kind: 'start'
  readonly title: string
  readonly input: Input
}

/** An ordinary node: input schema, output schema, handler. */
export type NodeDefinition<
  Input extends z.ZodObject = z.ZodObject,
  Output extends z.ZodObject = z.ZodObject,
> = {
  readonly kind: 'transform' | 'sink'
  readonly title: string
  readonly input: Input
  readonly output: Output
  readonly run: NodeHandler<Input, Output>
}

/**
 * Loose upper bounds, for generic constraints and for storing definitions in one record.
 * `NodeDefinition<Specific>` is not assignable to `NodeDefinition<z.ZodObject>` — `run`'s parameter
 * is contravariant — but it is assignable to `AnyNodeDefinition`.
 */
export type AnyStartDefinition = {
  readonly kind: 'start'
  readonly title: string
  readonly input: z.ZodObject
}

export type AnyNodeDefinition = {
  readonly kind: 'transform' | 'sink'
  readonly title: string
  readonly input: z.ZodObject
  readonly output: z.ZodObject
  /**
   * Method syntax, not a property, and deliberately so: methods keep their parameters bivariant
   * under `strictFunctionTypes`, which is what makes `definition.run(input, context)` callable
   * across this loose bound without a cast (P9 needs exactly that). A property typed as a function
   * would be checked contravariantly and would force `input` down to `never`. Do not "tidy" this
   * back into a property.
   */
  run(input: unknown, context: NodeRunContext): unknown
}

export type AnyDefinition = AnyStartDefinition | AnyNodeDefinition

/** Declare a start. A flow may have any number of them. */
export function start<Input extends z.ZodObject>(definition: {
  title: string
  input: Input
}): StartDefinition<Input> {
  return { kind: 'start', title: definition.title, input: definition.input }
}

/** Declare an ordinary node. `kind` defaults to `transform`; pass `'sink'` for a terminal node. */
export function node<Input extends z.ZodObject, Output extends z.ZodObject>(definition: {
  title: string
  input: Input
  output: Output
  run: NodeHandler<Input, Output>
  kind?: 'transform' | 'sink'
}): NodeDefinition<Input, Output> {
  return {
    kind: definition.kind ?? 'transform',
    title: definition.title,
    input: definition.input,
    output: definition.output,
    run: definition.run,
  }
}
