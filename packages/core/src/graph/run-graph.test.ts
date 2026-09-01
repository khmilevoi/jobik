import { describe, expect, it } from 'vitest'
import { StartNotFoundError } from '#errors.js'
import {
  branchDocument,
  branchFlow,
  errorOrThrow,
  flowDocument,
  okOrThrow,
  publicationDocument,
  publicationFlow,
} from './fixtures.js'
import { resolveRunGraph } from './run-graph.js'
import { validateFlowGraph } from './validate.js'

function branchGraph() {
  return okOrThrow(validateFlowGraph({ flow: branchFlow, document: branchDocument() }))
}

describe('resolveRunGraph()', () => {
  it('keeps only what is downstream of the selected start, in run order', () => {
    const run = okOrThrow(resolveRunGraph({ graph: branchGraph(), startId: 's1' }))
    expect(run.flowName).toBe('branch')
    expect(run.startId).toBe('s1')
    expect(run.start.id).toBe('s1')
    expect(run.order).toEqual(['s1', 'a', 'b'])
    expect([...run.nodes.keys()]).toEqual(['s1', 'a', 'b'])
  })

  it('resolves a different start to a different subgraph of the same flow', () => {
    const run = okOrThrow(resolveRunGraph({ graph: branchGraph(), startId: 's2' }))
    expect(run.order).toEqual(['s2', 'c'])
    expect(run.nodes.has('a')).toBe(false)
  })

  /**
   * This test used to pin the opposite — it kept `d` "so P9 can see the gap". P9 saw the gap and had
   * nothing true to say about it: the frozen taxonomy has no error for "unreachable from the
   * selected start", so it reported `d` as skipped by an `UpstreamFailedError` blaming `c`, a node
   * that never ran, inside a run that still called itself `ok`. Inclusion whose only consumer must
   * lie buys nothing, so the join is dropped here instead.
   */
  it('drops a join fed by a second start, because this run can never feed it', () => {
    const fromS1 = okOrThrow(resolveRunGraph({ graph: branchGraph(), startId: 's1' }))
    const fromS2 = okOrThrow(resolveRunGraph({ graph: branchGraph(), startId: 's2' }))

    // `d` needs both `a` and `c`, and no single start reaches both.
    expect(fromS1.nodes.has('d')).toBe(false)
    expect(fromS2.nodes.has('d')).toBe(false)
    expect(fromS1.nodes.has('c')).toBe(false)
  })

  it('leaves every run graph closed under its own dependencies', () => {
    for (const startId of ['s1', 's2']) {
      const run = okOrThrow(resolveRunGraph({ graph: branchGraph(), startId }))
      const dangling = [...run.nodes.values()].flatMap((node) =>
        node.dependencies
          .filter((dependency) => !run.nodes.has(dependency))
          .map((dependency) => `${node.id} -> ${dependency}`),
      )
      expect(dangling).toEqual([])
    }
  })

  it('runs the whole flow when one start feeds everything', () => {
    const graph = okOrThrow(
      validateFlowGraph({ flow: publicationFlow, document: publicationDocument() }),
    )
    const run = okOrThrow(resolveRunGraph({ graph, startId: 'start1' }))
    expect(run.order).toEqual(['start1', 'render', 'publish'])
    expect(run.start.definition.kind).toBe('start')
  })

  it('resolves a start with nothing downstream to itself alone', () => {
    const document = flowDocument({
      literals: { render: { markdown: 'inline' }, publish: { caption: 'c', channel: 'blog' } },
    })
    const graph = okOrThrow(validateFlowGraph({ flow: publicationFlow, document }))
    const run = okOrThrow(resolveRunGraph({ graph, startId: 'start1' }))
    expect(run.order).toEqual(['start1'])
    expect(run.nodes.size).toBe(1)
  })

  it('reports an unknown start id with the ids that do exist', () => {
    const error = errorOrThrow(
      resolveRunGraph({ graph: branchGraph(), startId: 'nope' }),
      StartNotFoundError,
    )
    expect(error.startId).toBe('nope')
    expect(error.available).toEqual(['s1', 's2'])
    expect(error.message).toBe('This flow declares no start named nope')
  })

  it('reports an ordinary node used as a start the same way', () => {
    const error = errorOrThrow(
      resolveRunGraph({ graph: branchGraph(), startId: 'a' }),
      StartNotFoundError,
    )
    expect(error.available).toEqual(['s1', 's2'])
  })
})
