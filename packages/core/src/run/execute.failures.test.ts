import { describe, expect, it } from 'vitest'
import { NodeExecutionError } from '../errors.js'
import { errorOrThrow } from '../graph/fixtures.js'
import { executeRunGraph } from './execute.js'
import {
  badOutput,
  FixtureNodeError,
  failureRunGraph,
  literalRunGraph,
  rejecting,
  returningError,
  throwing,
  throwingLiteral,
} from './fixtures.js'
import type { NodeReport, RunReport } from './types.js'

function nodeReport(report: RunReport, nodeId: string): NodeReport {
  const found = report.nodes.find((node) => node.nodeId === nodeId)
  if (found === undefined) throw new Error(`no report entry for '${nodeId}'`)
  return found
}

function runFailure(failing: Parameters<typeof failureRunGraph>[0], runNumber = 3) {
  return executeRunGraph({
    graph: failureRunGraph(failing),
    startOutput: { text: 'a' },
    runNumber,
  })
}

describe('executeRunGraph() node failures', () => {
  it('keeps a handler-returned error as the node error, untouched', async () => {
    const report = await runFailure(returningError)
    const boom = nodeReport(report, 'boom')

    expect(boom.status).toBe('failed')
    expect(boom.error).toBeInstanceOf(FixtureNodeError)
    expect(boom.output).toBeNull()
    expect(report.status).toBe('failed')
  })

  it('wraps a thrown handler error in NodeExecutionError, carrying it as cause', async () => {
    const report = await runFailure(throwing)
    const error = errorOrThrow(nodeReport(report, 'boom').error, NodeExecutionError)

    expect(error.nodeId).toBe('boom')
    expect(error.runNumber).toBe(3)
    expect(error.message).toBe('Node boom failed')
    expect(error.cause).toBeInstanceOf(RangeError)
  })

  it('wraps a thrown non-Error too, because the boundary must hold for any throw', async () => {
    const report = await runFailure(throwingLiteral)
    const error = errorOrThrow(nodeReport(report, 'boom').error, NodeExecutionError)

    expect(error.cause).toBe('boom')
  })

  it('wraps a rejected handler promise', async () => {
    const report = await runFailure(rejecting)
    const error = errorOrThrow(nodeReport(report, 'boom').error, NodeExecutionError)

    expect(error.cause).toBeInstanceOf(TypeError)
  })

  it('leaves the stack frames for the server to attach', async () => {
    const report = await runFailure(throwing)
    const error = errorOrThrow(nodeReport(report, 'boom').error, NodeExecutionError)

    expect(error.frames).toEqual([])
    expect(error.hiddenFrames).toBe(0)
  })

  it('fails a node whose handler output does not match its output schema', async () => {
    const report = await runFailure(badOutput)
    const boom = nodeReport(report, 'boom')
    const error = errorOrThrow(boom.error, NodeExecutionError)

    expect(boom.status).toBe('failed')
    expect(boom.assets).toEqual({})
    expect(error.cause).toBeInstanceOf(Error)
  })

  it('applies a document literal that parses', async () => {
    const report = await executeRunGraph({
      graph: literalRunGraph(2),
      startOutput: { text: 'ab' },
      runNumber: 1,
    })

    expect(nodeReport(report, 'counter').output).toEqual({ text: 'abab' })
  })

  it('fails a node whose document literal does not parse', async () => {
    const report = await executeRunGraph({
      graph: literalRunGraph('two'),
      startOutput: { text: 'ab' },
      runNumber: 1,
    })
    const counter = nodeReport(report, 'counter')

    expect(counter.status).toBe('failed')
    expect(counter.elapsedMs).toBe(0)
    expect(errorOrThrow(counter.error, NodeExecutionError).nodeId).toBe('counter')
  })
})
