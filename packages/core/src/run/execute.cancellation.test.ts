import * as errore from 'errore'
import { describe, expect, it } from 'vitest'
import { RunCancelledError } from '../errors.js'
import { errorOrThrow } from '../graph/fixtures.js'
import { executeRunGraph } from './execute.js'
import { createParkingRunGraph } from './fixtures.js'
import type { RunEvent, RunReport } from './types.js'

function statusesOf(report: RunReport): Record<string, string> {
  return Object.fromEntries(report.nodes.map((node) => [node.nodeId, node.status]))
}

describe('executeRunGraph() cancellation', () => {
  it('settles with the abort error, keeps settled results and skips the rest', async () => {
    const { graph, entered } = createParkingRunGraph()
    const controller = new AbortController()

    const running = executeRunGraph({
      graph,
      startOutput: { text: 'a' },
      runNumber: 12,
      options: { signal: controller.signal },
    })
    await entered
    controller.abort()
    const report = await running

    expect(report.status).toBe('cancelled')
    expect(statusesOf(report)).toEqual({ s: 'ok', park: 'skipped', after: 'skipped' })
    expect(report.nodes[0].output).toEqual({ text: 'a' })
    const error = errorOrThrow(report.error, RunCancelledError)
    expect(error.runNumber).toBe(12)
    expect(errore.isAbortError(error)).toBe(true)
  })

  it('gives the cancelled in-flight node the same abort error and its measured time', async () => {
    const { graph, entered } = createParkingRunGraph()
    const controller = new AbortController()

    const running = executeRunGraph({
      graph,
      startOutput: { text: 'a' },
      runNumber: 1,
      options: { signal: controller.signal },
    })
    await entered
    controller.abort()
    const report = await running
    const park = report.nodes[1]

    expect(park.nodeId).toBe('park')
    expect(park.error).toBe(report.error)
    expect(park.output).toBeNull()
    expect(park.elapsedMs).toBeGreaterThanOrEqual(0)
  })

  it('streams the skipped transitions and the settled report', async () => {
    const { graph, entered } = createParkingRunGraph()
    const controller = new AbortController()
    const events: RunEvent[] = []

    const running = executeRunGraph({
      graph,
      startOutput: { text: 'a' },
      runNumber: 1,
      options: { signal: controller.signal, onEvent: (event) => events.push(event) },
    })
    await entered
    controller.abort()
    await running

    expect(
      events.flatMap((event) =>
        event.type === 'node-status' && event.status === 'skipped' ? [event.nodeId] : [],
      ),
    ).toEqual(['park', 'after'])
    expect(events.at(-1)?.type).toBe('run-settled')
  })

  it('cancels a run whose signal was already aborted before it started', async () => {
    const { graph } = createParkingRunGraph()
    const controller = new AbortController()
    controller.abort()

    const report = await executeRunGraph({
      graph,
      startOutput: { text: 'a' },
      runNumber: 1,
      options: { signal: controller.signal },
    })

    expect(report.status).toBe('cancelled')
    expect(statusesOf(report)).toEqual({ s: 'ok', park: 'skipped', after: 'skipped' })
  })
})
