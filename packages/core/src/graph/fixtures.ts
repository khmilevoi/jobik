import path from 'node:path'
import * as z from 'zod'
import { asset } from '#asset.js'
import { CURRENT_FLOW_VERSION, FLOW_DOCUMENT_FORMAT, type FlowDocument } from '#document/schema.js'
import { flow } from '#flow.js'
import { node, start } from '#node.js'

/**
 * Test-only flows, documents and narrowing helpers for the `graph/` test files.
 *
 * Nothing in the package entry graph imports this module, so tsdown never bundles it; it exists in
 * `src/` only so that typecheck and lint cover it like any other file.
 */

export const publicationInput = start({
  title: 'Publication input',
  input: z.object({ title: z.string(), markdown: z.string() }),
})

export const render = node({
  title: 'Render image',
  input: z.object({ markdown: z.string(), width: z.number().optional() }),
  output: z.object({ image: asset({ mime: 'image/png' }), caption: z.string() }),
  run: async ({ markdown }) => ({ image: Buffer.from(markdown), caption: markdown }),
})

export const publish = node({
  kind: 'sink',
  title: 'Publish',
  input: z.object({ caption: z.string(), channel: z.string() }),
  output: z.object({}),
  run: () => ({}),
})

export const flowPath = path.resolve('flow.jobik.json')

/** start1 -> render -> publish. `render.width` is optional; `publish.channel` needs a literal. */
export const publicationFlow = flow('publication')
  .start('start1', publicationInput)
  .node('render', render)
  .node('publish', publish)
  .bind('path', flowPath)

const echo = node({
  title: 'Echo',
  input: z.object({ value: z.string() }),
  output: z.object({ value: z.string() }),
  run: ({ value }) => ({ value }),
})

/** Two interchangeable nodes, for the cycle and duplicate-connection cases. */
export const pairFlow = flow('pair').node('a', echo).node('b', echo).bind('path', flowPath)

const seeded = node({
  title: 'Seeded',
  input: z.object({ seed: z.string() }),
  output: z.object({ value: z.string() }),
  run: ({ seed }) => ({ value: seed }),
})

const relay = node({
  title: 'Relay',
  input: z.object({ value: z.string() }),
  output: z.object({ value: z.string() }),
  run: ({ value }) => ({ value }),
})

const join = node({
  title: 'Join',
  input: z.object({ left: z.string(), right: z.string() }),
  output: z.object({ value: z.string() }),
  run: ({ left, right }) => ({ value: `${left}${right}` }),
})

/** Two starts, one shared downstream node: s1 -> a -> {b, d}, s2 -> c -> d. */
export const branchFlow = flow('branch')
  .start('s1', start({ title: 'S1', input: z.object({ seed: z.string() }) }))
  .start('s2', start({ title: 'S2', input: z.object({ seed: z.string() }) }))
  .node('a', seeded)
  .node('b', relay)
  .node('c', seeded)
  .node('d', join)
  .bind('path', flowPath)

const counter = node({
  title: 'Counter',
  input: z.object({ count: z.coerce.number() }),
  output: z.object({ count: z.number() }),
  run: ({ count }) => ({ count }),
})

/** A start whose string output feeds an input that coerces it to a number. */
export const coercingFlow = flow('coercing')
  .start('s', start({ title: 'S', input: z.object({ text: z.string() }) }))
  .node('counter', counter)
  .bind('path', flowPath)

/** A current-version document with the three mutable sections defaulted to empty. */
export function flowDocument(
  parts: Partial<Pick<FlowDocument, 'connections' | 'literals' | 'layout'>> = {},
): FlowDocument {
  return {
    format: FLOW_DOCUMENT_FORMAT,
    version: CURRENT_FLOW_VERSION,
    connections: parts.connections ?? [],
    literals: parts.literals ?? {},
    layout: parts.layout ?? {},
  }
}

/** The document that makes `publicationFlow` valid. */
export function publicationDocument(): FlowDocument {
  return flowDocument({
    connections: [
      { from: { node: 'start1', field: 'markdown' }, to: { node: 'render', field: 'markdown' } },
      { from: { node: 'render', field: 'caption' }, to: { node: 'publish', field: 'caption' } },
    ],
    literals: { render: {}, publish: { channel: 'blog' } },
    layout: {
      start1: { x: 80, y: 160 },
      render: { x: 420, y: 160 },
      publish: { x: 760, y: 160 },
    },
  })
}

/** The document that makes `branchFlow` valid. Every input is connected, so no literals. */
export function branchDocument(): FlowDocument {
  return flowDocument({
    connections: [
      { from: { node: 's1', field: 'seed' }, to: { node: 'a', field: 'seed' } },
      { from: { node: 'a', field: 'value' }, to: { node: 'b', field: 'value' } },
      { from: { node: 's2', field: 'seed' }, to: { node: 'c', field: 'seed' } },
      { from: { node: 'a', field: 'value' }, to: { node: 'd', field: 'left' } },
      { from: { node: 'c', field: 'value' }, to: { node: 'd', field: 'right' } },
    ],
  })
}

/** Narrow an errore-style `T | Error` in a test, failing loudly when it is the error. */
export function okOrThrow<T>(result: T | Error): Exclude<T, Error> {
  if (result instanceof Error) {
    throw new Error(`expected a value, received ${result.name}: ${result.message}`)
  }
  return result as Exclude<T, Error>
}

/** Narrow to a specific tagged error in a test, failing loudly when it is anything else. */
export function errorOrThrow<E extends Error>(
  result: unknown,
  ErrorClass: new (...args: never[]) => E,
): E {
  if (!(result instanceof ErrorClass)) {
    throw new Error(`expected ${ErrorClass.name}, received ${String(result)}`)
  }
  return result
}
