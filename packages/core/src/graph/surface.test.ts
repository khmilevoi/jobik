import { describe, expect, it } from 'vitest'
import * as jobik from '#index.js'
import { branchDocument, branchFlow, okOrThrow } from './fixtures.js'

describe('@jobik/core graph surface', () => {
  it('exposes both graph functions at the top level of the namespace', () => {
    expect(typeof jobik.validateFlowGraph).toBe('function')
    expect(typeof jobik.resolveRunGraph).toBe('function')
  })

  it('keeps the internal helpers out of the public namespace', () => {
    expect('fieldTypeOf' in jobik).toBe(false)
    expect('topologicalOrder' in jobik).toBe(false)
  })

  it('validates and resolves a flow through the namespace alone', () => {
    const graph = okOrThrow(
      jobik.validateFlowGraph({ flow: branchFlow, document: branchDocument() }),
    )
    // `d` is a join fed by both starts, so no single-start run can feed it — see `run-graph.ts`.
    const run = okOrThrow(jobik.resolveRunGraph({ graph, startId: 's1' }))
    expect(run.order).toEqual(['s1', 'a', 'b'])
  })

  it('still exposes what P2 and P3 put there', () => {
    expect(typeof jobik.flow).toBe('function')
    expect(typeof jobik.readFlowDocument).toBe('function')
    expect(jobik.jobikErrorTags).toHaveLength(13)
  })
})
