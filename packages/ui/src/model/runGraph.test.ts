import path from 'node:path'
import type { BoundFlow, FlowDocument, RunGraph } from '@jobik/core'
import {
  CURRENT_FLOW_VERSION,
  FLOW_DOCUMENT_FORMAT,
  flow,
  node,
  resolveRunGraph,
  start,
  validateFlowGraph,
} from '@jobik/core'
import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import { runGraphNodeIds } from './runGraph.js'

/**
 * `runGraphNodeIds` restates core's `resolveRunGraph`, and this is where the two are pinned
 * together: both are run against the same authored flows and their node id sets must be equal.
 *
 * The duplication is forced, not sloppy. `resolveRunGraph` takes a `ValidatedFlowGraph`, which is
 * built from the authored `BoundFlow` and the Zod schemas inside it; the browser has the JSON
 * document and nothing else, and no wire line names the run graph's members — `run-started` counts
 * them. So the rule is written twice, and only a test can notice when the two copies drift.
 *
 * It lives on the `ui` side because it can only live here: `@jobik/core` does not depend on
 * `@jobik/ui` and must not, so a core-side test could not import the copy it is pinning. `ui` runs
 * under jsdom, which costs these pure functions nothing.
 *
 * The shape is `assets.test.ts`'s: that module keeps a verbatim copy of `field-type.ts`'s
 * `CARDINALITY_WRAPPERS`, and its test pins the agreement against `fieldTypeOf` itself rather than
 * against the list. `expected` below is here for a different job — it pins the FIXTURES, so a case
 * that stops exercising what its name claims fails instead of quietly agreeing about nothing.
 */

const FLOW_PATH = path.resolve('flow.jobik.json')

const seed = start({ title: 'Seed', input: z.object({ seed: z.string() }) })

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

function documentOf(
  connections: readonly { from: [string, string]; to: [string, string] }[],
): FlowDocument {
  return {
    format: FLOW_DOCUMENT_FORMAT,
    version: CURRENT_FLOW_VERSION,
    connections: connections.map(({ from, to }) => ({
      from: { node: from[0], field: from[1] },
      to: { node: to[0], field: to[1] },
    })),
    literals: {},
    layout: {},
  }
}

/** `s -> a -> b`. */
const CHAIN_FLOW = flow('chain')
  .start('s', seed)
  .node('a', relay)
  .node('b', relay)
  .bind('path', FLOW_PATH)

const CHAIN_DOCUMENT = documentOf([
  { from: ['s', 'seed'], to: ['a', 'value'] },
  { from: ['a', 'value'], to: ['b', 'value'] },
])

/** `s1 -> a`, `s2 -> b`, and `s3` with nothing downstream — `pokedex`'s shape, plus a lone start. */
const PIPELINES_FLOW = flow('pipelines')
  .start('s1', seed)
  .node('a', relay)
  .start('s2', seed)
  .node('b', relay)
  .start('s3', seed)
  .bind('path', FLOW_PATH)

const PIPELINES_DOCUMENT = documentOf([
  { from: ['s1', 'seed'], to: ['a', 'value'] },
  { from: ['s2', 'seed'], to: ['b', 'value'] },
])

/** The join `pokedex`'s binding warns against: `j` is fed by both pipelines, and `tail` sits under it. */
const JOIN_FLOW = flow('join')
  .start('s1', seed)
  .node('a', relay)
  .start('s2', seed)
  .node('b', relay)
  .node('j', join)
  .node('tail', relay)
  .bind('path', FLOW_PATH)

const JOIN_DOCUMENT = documentOf([
  { from: ['s1', 'seed'], to: ['a', 'value'] },
  { from: ['s2', 'seed'], to: ['b', 'value'] },
  { from: ['a', 'value'], to: ['j', 'left'] },
  { from: ['b', 'value'], to: ['j', 'right'] },
  { from: ['j', 'value'], to: ['tail', 'value'] },
])

const CASES = [
  {
    name: 'a linear chain',
    flow: CHAIN_FLOW,
    document: CHAIN_DOCUMENT,
    startId: 's',
    expected: ['a', 'b', 's'],
  },
  {
    name: 'two independent pipelines, from the first start',
    flow: PIPELINES_FLOW,
    document: PIPELINES_DOCUMENT,
    startId: 's1',
    expected: ['a', 's1'],
  },
  {
    name: 'two independent pipelines, from the second start',
    flow: PIPELINES_FLOW,
    document: PIPELINES_DOCUMENT,
    startId: 's2',
    expected: ['b', 's2'],
  },
  {
    name: 'a start with nothing downstream',
    flow: PIPELINES_FLOW,
    document: PIPELINES_DOCUMENT,
    startId: 's3',
    expected: ['s3'],
  },
  {
    name: 'a join fed from both starts, which takes everything under it with it',
    flow: JOIN_FLOW,
    document: JOIN_DOCUMENT,
    startId: 's1',
    expected: ['a', 's1'],
  },
  {
    name: 'the same join, from the other start',
    flow: JOIN_FLOW,
    document: JOIN_DOCUMENT,
    startId: 's2',
    expected: ['b', 's2'],
  },
] as const

/** Core returns both of these as `T | Error`; a fixture that cannot validate is a broken test. */
function coreRunGraph(bound: BoundFlow, document: FlowDocument, startId: string): RunGraph {
  const graph = validateFlowGraph({ flow: bound, document })
  if (graph instanceof Error) throw graph
  const runGraph = resolveRunGraph({ graph, startId })
  if (runGraph instanceof Error) throw runGraph
  return runGraph
}

describe('runGraphNodeIds() against core resolveRunGraph()', () => {
  for (const testCase of CASES) {
    it(`resolves the same nodes for ${testCase.name}`, () => {
      const resolved = coreRunGraph(testCase.flow, testCase.document, testCase.startId)
      const core = [...resolved.nodes.keys()]
      const browser = [...runGraphNodeIds(testCase.document, testCase.startId)]

      expect(browser.sort()).toEqual(core.sort())
      expect(core.sort()).toEqual([...testCase.expected])
    })
  }
})
