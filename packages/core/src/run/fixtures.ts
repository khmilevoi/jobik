import * as errore from 'errore'
import * as z from 'zod'
import { flow } from '#flow.js'
import { flowDocument, flowPath, okOrThrow } from '#graph/fixtures.js'
import { resolveRunGraph } from '#graph/run-graph.js'
import { validateFlowGraph } from '#graph/validate.js'
import { type AnyNodeDefinition, node, start } from '#node.js'

/**
 * Test-only flows for the `run/` test files: one handler per way a node can fail, and the two flow
 * shapes the execution tests need. Nothing in the package entry graph imports this module, so
 * tsdown never bundles it; it lives in `src/` only so typecheck and lint cover it.
 */

/** The domain error a handler returns as a value, the way the design's `ImageRenderError` does. */
export class FixtureNodeError extends errore.createTaggedError({
  name: 'FixtureNodeError',
  message: 'the fixture node refused to run',
}) {}

const textIo = {
  input: z.object({ text: z.string() }),
  output: z.object({ text: z.string() }),
}

/** The well-behaved node every fixture flow uses for the branches that must succeed. */
export const upper = node({
  title: 'Upper',
  ...textIo,
  run: ({ text }) => ({ text: text.toUpperCase() }),
})

/** Writes two log lines, so the progress tests can watch them arrive attributed to their node. */
export const logging = node({
  title: 'Logs',
  ...textIo,
  run: ({ text }, context) => {
    context.log('starting')
    context.log(`done with ${text}`)
    return { text }
  },
})

/** Returns its failure as a value, which the spec says handlers do for expected failures. */
export const returningError = node({
  title: 'Returns an error value',
  ...textIo,
  run: () => new FixtureNodeError({}),
})

/** The async form of the same case, which is what real handlers usually look like. */
export const returningErrorAsync = node({
  title: 'Returns an error value asynchronously',
  ...textIo,
  run: async () => new FixtureNodeError({}),
})

/** Throws synchronously, which third-party handler code does. */
export const throwing = node({
  title: 'Throws',
  ...textIo,
  run: () => {
    throw new RangeError('thrown inside the handler')
  },
})

/** Throws a value that is not an Error at all — the boundary must still hold. */
export const throwingLiteral = node({
  title: 'Throws a non-Error',
  ...textIo,
  run: () => {
    throw 'boom'
  },
})

/** Rejects after an await, which is the async half of the same boundary. */
export const rejecting = node({
  title: 'Rejects',
  ...textIo,
  run: async () => {
    await Promise.resolve()
    throw new TypeError('rejected inside the handler')
  },
})

/** Resolves with a value its own output schema rejects. Only a cast can express this. */
export const badOutput = node({
  title: 'Returns the wrong shape',
  ...textIo,
  run: () => ({ text: 42 }) as unknown as { text: string },
})

/**
 * Throws synchronously from inside `.transform()`, the everyday `z.string().transform(JSON.parse)`
 * shape. Zod v4's `safeParse` does NOT catch this: verified against `zod@4.5.4`, `safeParse` itself
 * throws the `RangeError` rather than returning `{ success: false }`. A node's or a start's schema
 * is flow-author code, exactly as third-party as a handler, so this fixture stands in for both.
 */
export const throwingSchema = z.object({
  text: z.string().transform((): string => {
    throw new RangeError('boom in transform')
  }),
})

/** Its INPUT schema throws while parsing the assembled input, before `run` is ever invoked. */
export const throwingInput = node({
  title: 'Input schema throws',
  input: throwingSchema,
  output: textIo.output,
  run: ({ text }) => ({ text }),
})

/** Its OUTPUT schema throws while parsing the handler's settled result. */
export const throwingOutput = node({
  title: 'Output schema throws',
  input: textIo.input,
  output: throwingSchema,
  run: ({ text }) => ({ text }),
})

/**
 * `s -> boom -> after`, plus `s -> safe`: one branch that fails and one that must still run.
 * Kahn's algorithm over declaration order settles this as `['s', 'boom', 'safe', 'after']`, so
 * `safe` is walked AFTER the failure and `after` is walked last.
 */
export function failureRunGraph(failing: AnyNodeDefinition) {
  const bound = flow('failure')
    .start('s', start({ title: 'S', input: z.object({ text: z.string() }) }))
    .node('boom', failing)
    .node('after', upper)
    .node('safe', upper)
    .bind('path', flowPath)

  const document = flowDocument({
    connections: [
      { from: { node: 's', field: 'text' }, to: { node: 'boom', field: 'text' } },
      { from: { node: 'boom', field: 'text' }, to: { node: 'after', field: 'text' } },
      { from: { node: 's', field: 'text' }, to: { node: 'safe', field: 'text' } },
    ],
  })

  const graph = okOrThrow(validateFlowGraph({ flow: bound, document }))
  return okOrThrow(resolveRunGraph({ graph, startId: 's' }))
}

const counter = node({
  title: 'Counter',
  input: z.object({ text: z.string(), count: z.number() }),
  output: z.object({ text: z.string() }),
  run: ({ text, count }) => ({ text: text.repeat(count) }),
})

/**
 * `s -> counter`, where `counter.count` is unconnected and comes from a document literal. Graph
 * validation now parses the literal's VALUE against the field's schema, so a literal this fixture
 * accepts is one the run is guaranteed to accept too. Pass only well-typed values; a bad literal is
 * a graph-validation case and belongs in `graph/validate.test.ts`.
 */
export function literalRunGraph(count: unknown) {
  const bound = flow('literal')
    .start('s', start({ title: 'S', input: z.object({ text: z.string() }) }))
    .node('counter', counter)
    .bind('path', flowPath)

  const document = flowDocument({
    connections: [{ from: { node: 's', field: 'text' }, to: { node: 'counter', field: 'text' } }],
    literals: { counter: { count } },
  })

  const graph = okOrThrow(validateFlowGraph({ flow: bound, document }))
  return okOrThrow(resolveRunGraph({ graph, startId: 's' }))
}

const refiner = node({
  title: 'Refiner',
  input: z.object({ text: z.string().min(5) }),
  output: z.object({ text: z.string() }),
  run: ({ text }) => ({ text }),
})

/**
 * `s -> refiner`, where the edge is well typed — both ends are `string` — but `refiner` narrows its
 * input past anything a field type can express. Graph validation compares field KINDS, so it
 * accepts the edge; only the run parses the VALUE that flows down it. That is the input-parse
 * failure path in `execute.ts`, which no literal can reach any more now that validation parses
 * those up front.
 */
export function refinedRunGraph() {
  const bound = flow('refined')
    .start('s', start({ title: 'S', input: z.object({ text: z.string() }) }))
    .node('refiner', refiner)
    .bind('path', flowPath)

  const document = flowDocument({
    connections: [{ from: { node: 's', field: 'text' }, to: { node: 'refiner', field: 'text' } }],
  })

  const graph = okOrThrow(validateFlowGraph({ flow: bound, document }))
  return okOrThrow(resolveRunGraph({ graph, startId: 's' }))
}

/**
 * `s -> park -> after`, where `park` blocks until the run is cancelled and then resolves with its
 * input. `entered` resolves the moment the handler is invoked, which is what lets a test cancel a
 * run at a deterministic point instead of guessing at a timer.
 */
export function createParkingRunGraph() {
  let enter: () => void = () => {}
  const entered = new Promise<void>((resolve) => {
    enter = resolve
  })

  const parking = node({
    title: 'Parks until cancelled',
    ...textIo,
    run: (input, context) => {
      enter()
      return new Promise<{ text: string }>((resolve) => {
        context.signal.addEventListener('abort', () => resolve(input), { once: true })
      })
    },
  })

  const bound = flow('parking')
    .start('s', start({ title: 'S', input: z.object({ text: z.string() }) }))
    .node('park', parking)
    .node('after', upper)
    .bind('path', flowPath)

  const document = flowDocument({
    connections: [
      { from: { node: 's', field: 'text' }, to: { node: 'park', field: 'text' } },
      { from: { node: 'park', field: 'text' }, to: { node: 'after', field: 'text' } },
    ],
  })

  const graph = okOrThrow(validateFlowGraph({ flow: bound, document }))
  return { graph: okOrThrow(resolveRunGraph({ graph, startId: 's' })), entered }
}

/**
 * `s -> park -> after`, where `park` logs, then parks, then — like a real handler that ignores
 * `signal` and keeps running past cancellation — resolves on abort and logs AGAIN on a later tick.
 * That later log call is the zombie case F-1 fixes: it must never reach the settled report or the
 * event stream.
 */
export function createLoggingParkingRunGraph() {
  let enter: () => void = () => {}
  const entered = new Promise<void>((resolve) => {
    enter = resolve
  })
  // Resolves INSIDE the timer callback below, so a test that awaits it proves the zombie log call
  // actually happened — rather than guessing at a fixed `wait(ms)` that would still pass silently
  // if the timer never fired at all.
  let markLoggedAfterAbort: () => void = () => {}
  const loggedAfterAbort = new Promise<void>((resolve) => {
    markLoggedAfterAbort = resolve
  })

  const parking = node({
    title: 'Logs, parks, resolves on abort, then logs again on a later tick',
    ...textIo,
    run: (input, context) => {
      context.log('before abort')
      enter()
      return new Promise<{ text: string }>((resolve) => {
        context.signal.addEventListener(
          'abort',
          () => {
            resolve(input)
            setTimeout(() => {
              context.log('after abort')
              markLoggedAfterAbort()
            }, 0)
          },
          { once: true },
        )
      })
    },
  })

  const bound = flow('logging-parking')
    .start('s', start({ title: 'S', input: z.object({ text: z.string() }) }))
    .node('park', parking)
    .node('after', upper)
    .bind('path', flowPath)

  const document = flowDocument({
    connections: [
      { from: { node: 's', field: 'text' }, to: { node: 'park', field: 'text' } },
      { from: { node: 'park', field: 'text' }, to: { node: 'after', field: 'text' } },
    ],
  })

  const graph = okOrThrow(validateFlowGraph({ flow: bound, document }))
  return { graph: okOrThrow(resolveRunGraph({ graph, startId: 's' })), entered, loggedAfterAbort }
}
