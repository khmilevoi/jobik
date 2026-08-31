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
    expect(run.order).toEqual(['s1', 'a', 'b', 'd'])
    expect([...run.nodes.keys()]).toEqual(['s1', 'a', 'b', 'd'])
  })

  it('resolves a different start to a different subgraph of the same flow', () => {
    const run = okOrThrow(resolveRunGraph({ graph: branchGraph(), startId: 's2' }))
    expect(run.order).toEqual(['s2', 'c', 'd'])
    expect(run.nodes.has('a')).toBe(false)
  })

  it('keeps a shared node and leaves the other start out, so P9 can see the gap', () => {
    const run = okOrThrow(resolveRunGraph({ graph: branchGraph(), startId: 's1' }))
    const join = run.nodes.get('d')
    expect(join?.inputs).toEqual([
      { field: 'left', from: { node: 'a', field: 'value' } },
      { field: 'right', from: { node: 'c', field: 'value' } },
    ])
    expect(run.nodes.has('c')).toBe(false)
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
