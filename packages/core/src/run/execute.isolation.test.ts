import { describe, expect, it } from 'vitest'
import { UpstreamFailedError } from '#errors.js'
import { branchDocument, branchFlow, errorOrThrow, okOrThrow } from '#graph/fixtures.js'
import { resolveRunGraph } from '#graph/run-graph.js'
import { validateFlowGraph } from '#graph/validate.js'
import { executeRunGraph } from './execute.js'
import { failureRunGraph, throwing } from './fixtures.js'
import type { NodeReport, RunReport } from './types.js'

function nodeReport(report: RunReport, nodeId: string): NodeReport {
  const found = report.nodes.find((node) => node.nodeId === nodeId)
  if (found === undefined) throw new Error(`no report entry for '${nodeId}'`)
  return found
}

function statusesOf(report: RunReport): Record<string, string> {
  return Object.fromEntries(report.nodes.map((node) => [node.nodeId, node.status]))
}

describe('executeRunGraph() failure isolation', () => {
  it('skips only the descendants of a failed node and still runs the unrelated branch', async () => {
    const report = await executeRunGraph({
      graph: failureRunGraph(throwing),
      startOutput: { text: 'a' },
      runNumber: 4,
    })

    expect(report.nodes.map((node) => node.nodeId)).toEqual(['s', 'boom', 'safe', 'after'])
    expect(statusesOf(report)).toEqual({ s: 'ok', boom: 'failed', safe: 'ok', after: 'skipped' })
    expect(nodeReport(report, 'safe').output).toEqual({ text: 'A' })
    expect(report.status).toBe('failed')
  })

  it('gives a skipped node an UpstreamFailedError naming the node that failed', async () => {
    const report = await executeRunGraph({
      graph: failureRunGraph(throwing),
      startOutput: { text: 'a' },
      runNumber: 4,
    })
    const after = nodeReport(report, 'after')
    const error = errorOrThrow(after.error, UpstreamFailedError)

    expect(after.status).toBe('skipped')
    expect(after.elapsedMs).toBe(0)
    expect(after.output).toBeNull()
    expect(error.nodeId).toBe('after')
    expect(error.upstreamNodeId).toBe('boom')
    expect(error.runNumber).toBe(4)
  })

  it('never blames a node the run does not contain, and reports ok only for a run that ran', async () => {
    // branchFlow: s1 -> a -> {b, d} and s2 -> c -> d. Running s1 reaches d, but d also needs c, so
    // `resolveRunGraph` leaves d out and this run is exactly the three nodes it could execute.
    // It used to keep d, settle it `skipped` with an `UpstreamFailedError` naming c — a node that
    // never ran — and still call the whole run `ok`.
    const graph = okOrThrow(validateFlowGraph({ flow: branchFlow, document: branchDocument() }))
    const runGraph = okOrThrow(resolveRunGraph({ graph, startId: 's1' }))

    const report = await executeRunGraph({
      graph: runGraph,
      startOutput: { seed: 'x' },
      runNumber: 1,
    })

    expect(statusesOf(report)).toEqual({ s1: 'ok', a: 'ok', b: 'ok' })
    expect(report.nodes.every((node) => node.error === null)).toBe(true)
    expect(report.status).toBe('ok')
  })
})
