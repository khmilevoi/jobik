import type { FlowDocument } from '@jobik/core'
import { describe, expect, it } from 'vitest'
import { endpointKey } from '#canvas/index.js'
import { NO_PROBLEMS, toFlowProblems } from './problems.js'

/**
 * The honest half of `3D`. Every assertion here is about what the ONE finding the wire carries
 * can and cannot say: the strip gets one row, the count derives from it, and the two canvas
 * treatments are chosen by whether the document gives the named port a source — never by a
 * fixture and never by a second finding nobody sent.
 */

const CONNECTED = {
  format: 'jobik.flow',
  version: 1,
  connections: [
    { from: { node: 'start1', field: 'markdown' }, to: { node: 'render', field: 'markdown' } },
  ],
  literals: {},
  layout: {},
} as unknown as FlowDocument

const EMPTY = {
  format: 'jobik.flow',
  version: 1,
  connections: [],
  literals: {},
  layout: {},
} as unknown as FlowDocument

describe('toFlowProblems — the strip rows', () => {
  it('makes exactly one row out of one wire error, in the server own words', () => {
    const model = toFlowProblems({
      error: { _tag: 'ConnectionError', message: 'render.markdown expects string' },
      document: EMPTY,
    })

    expect(model.problems).toEqual([
      {
        severity: 'error',
        code: 'ConnectionError',
        message: 'render.markdown expects string',
      },
    ])
    // `flow.ts:41` has no counterpart on the wire, so no row claims a location.
    expect(model.problems[0]?.source).toBeUndefined()
  })

  it('falls back to a neutral code when the failure carries no tag', () => {
    const model = toFlowProblems({
      error: { _tag: null, message: 'something went wrong' },
      document: EMPTY,
    })
    expect(model.problems[0]?.code).toBe('ValidationError')
  })

  it('marks nothing at all when the failure names no port and no cycle', () => {
    const model = toFlowProblems({
      error: { _tag: 'FlowSchemaError', message: 'not a jobik.flow document' },
      document: EMPTY,
    })

    expect(model.nodes.size).toBe(0)
    expect(model.fields.size).toBe(0)
    expect(model.edges.size).toBe(0)
  })
})

describe('toFlowProblems — a port with a source it cannot use', () => {
  const model = toFlowProblems({
    error: {
      _tag: 'ConnectionError',
      message: 'the flow graph is invalid',
      from: { node: 'start1', field: 'markdown' },
      to: { node: 'render', field: 'markdown' },
    },
    document: CONNECTED,
  })

  it('puts the receiving node on the solid card, with its own count', () => {
    expect(model.nodes.get('render')).toEqual({ problem: 'error', count: '1 error' })
    // The sending node is implicated, not at fault: the artboard leaves `start1` chrome alone.
    expect(model.nodes.has('start1')).toBe(false)
  })

  it('marks both ends of the connection, and only the receiving one lifts its label', () => {
    expect(model.fields.get(endpointKey('render', 'target', 'markdown'))).toEqual({
      problem: 'mismatch',
    })
    expect(model.fields.get(endpointKey('start1', 'source', 'markdown'))).toEqual({
      problem: 'linked',
    })
  })

  it('names the failing edge by the id the canvas gives it', () => {
    expect([...model.edges]).toEqual(['start1.markdown->render.markdown'])
  })

  it('leaves the type annotation alone — `string ≠ Buffer` needs a pair the wire has not got', () => {
    expect(
      model.fields.get(endpointKey('render', 'target', 'markdown'))?.annotation,
    ).toBeUndefined()
  })
})

describe('toFlowProblems — a port with no source', () => {
  const model = toFlowProblems({
    error: {
      _tag: 'ConnectionError',
      message: "required input field 'publish.caption' is neither connected nor given a literal",
      from: null,
      to: { node: 'publish', field: 'caption' },
    },
    document: EMPTY,
  })

  it('puts the node on the dashed card that cannot run, and gives it no header count', () => {
    expect(model.nodes.get('publish')).toEqual({ problem: 'blocked', count: '1 error' })
  })

  it('marks the port unsourced and says so where its type would be', () => {
    expect(model.fields.get(endpointKey('publish', 'target', 'caption'))).toEqual({
      problem: 'unsourced',
      annotation: 'no source',
    })
  })

  it('paints no edge, because there is none', () => {
    expect(model.edges.size).toBe(0)
  })
})

describe('toFlowProblems — the source is read off the document, not off `from`', () => {
  it('still reads a connected port as a mismatch when the payload names no `from`', () => {
    // `graph/validate.ts` sets `to` alone on the literal-versus-connection failures, and those
    // ports do have a source. Trusting `from === null` to mean "no source" would draw the dashed
    // cannot-run card on a node that is fully wired.
    const model = toFlowProblems({
      error: {
        _tag: 'ConnectionError',
        message: "input field 'render.markdown' is connected, so it cannot also take a literal",
        to: { node: 'render', field: 'markdown' },
      },
      document: CONNECTED,
    })

    expect(model.nodes.get('render')?.problem).toBe('error')
    expect(model.fields.get(endpointKey('render', 'target', 'markdown'))?.problem).toBe('mismatch')
    // And the connection the document does have is still the one painted.
    expect([...model.edges]).toEqual(['start1.markdown->render.markdown'])
  })
})

describe('toFlowProblems — a cycle', () => {
  it('marks every node the server named, and no port', () => {
    const model = toFlowProblems({
      error: {
        _tag: 'ConnectionError',
        message: 'the flow graph is invalid: the graph contains a cycle: a -> b -> a',
        from: null,
        to: null,
        cycle: ['a', 'b'],
      },
      document: EMPTY,
    })

    expect([...model.nodes.keys()]).toEqual(['a', 'b'])
    expect(model.nodes.get('a')?.problem).toBe('error')
    expect(model.fields.size).toBe(0)
  })
})

describe('NO_PROBLEMS', () => {
  it('is empty in every direction, so a valid flow marks nothing', () => {
    expect(NO_PROBLEMS.problems).toEqual([])
    expect(NO_PROBLEMS.nodes.size).toBe(0)
    expect(NO_PROBLEMS.fields.size).toBe(0)
    expect(NO_PROBLEMS.edges.size).toBe(0)
  })
})
