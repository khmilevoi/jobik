import { describe, expect, it } from 'vitest'
import { okOrThrow, publicationDocument, publicationFlow } from '../graph/fixtures.js'
import { resolveRunGraph } from '../graph/run-graph.js'
import { validateFlowGraph } from '../graph/validate.js'
import { executeRunGraph } from './execute.js'
import { failureRunGraph, logging, throwing } from './fixtures.js'
import type { RunEvent } from './types.js'

function publicationRunGraph() {
  const graph = okOrThrow(
    validateFlowGraph({ flow: publicationFlow, document: publicationDocument() }),
  )
  return okOrThrow(resolveRunGraph({ graph, startId: 'start1' }))
}

describe('executeRunGraph() progress', () => {
  it('opens with run started, queues every node, then reports each transition in order', async () => {
    const events: RunEvent[] = []

    await executeRunGraph({
      graph: publicationRunGraph(),
      startOutput: { title: 'A title', markdown: 'hello' },
      runNumber: 9,
      options: { onEvent: (event) => events.push(event) },
    })

    expect(events[0]).toEqual({
      type: 'run-started',
      runNumber: 9,
      flowName: 'publication',
      startId: 'start1',
      nodeCount: 3,
    })
    expect(
      events.flatMap((event) =>
        event.type === 'node-status' ? [`${event.nodeId}:${event.status}`] : [],
      ),
    ).toEqual([
      'start1:queued',
      'render:queued',
      'publish:queued',
      'start1:ok',
      'render:running',
      'render:ok',
      'publish:running',
      'publish:ok',
    ])
    expect(events.at(-1)?.type).toBe('run-settled')
  })

  it('settles with the very report the awaited call returns', async () => {
    const events: RunEvent[] = []

    const report = await executeRunGraph({
      graph: publicationRunGraph(),
      startOutput: { title: 'A title', markdown: 'hello' },
      runNumber: 1,
      options: { onEvent: (event) => events.push(event) },
    })

    const settled = events.at(-1)
    expect(settled?.type).toBe('run-settled')
    expect(settled?.type === 'run-settled' && settled.report).toBe(report)
  })

  it('carries the node error on a failed transition', async () => {
    const events: RunEvent[] = []

    await executeRunGraph({
      graph: failureRunGraph(throwing),
      startOutput: { text: 'a' },
      runNumber: 1,
      options: { onEvent: (event) => events.push(event) },
    })

    const failed = events.flatMap((event) =>
      event.type === 'node-status' && event.status === 'failed' ? [event] : [],
    )
    expect(failed.map((event) => event.nodeId)).toEqual(['boom'])
    expect(failed[0].error).toBeInstanceOf(Error)
  })

  it('streams a handler log line attributed to its node and keeps it in the report', async () => {
    const events: RunEvent[] = []

    const report = await executeRunGraph({
      graph: failureRunGraph(logging),
      startOutput: { text: 'a' },
      runNumber: 1,
      options: { onEvent: (event) => events.push(event) },
    })

    const streamed = events.flatMap((event) => (event.type === 'node-log' ? [event.line] : []))
    expect(streamed.map((line) => `${line.nodeId}: ${line.message}`)).toEqual([
      'boom: starting',
      'boom: done with a',
    ])
    expect(streamed[0].at).toBeGreaterThan(0)
    expect(report.logs).toEqual(streamed)
  })

  it('produces the same report shape when nobody is listening', async () => {
    const streamed: RunEvent[] = []
    const withStream = await executeRunGraph({
      graph: failureRunGraph(logging),
      startOutput: { text: 'a' },
      runNumber: 1,
      options: { onEvent: (event) => streamed.push(event) },
    })
    const withoutStream = await executeRunGraph({
      graph: failureRunGraph(logging),
      startOutput: { text: 'a' },
      runNumber: 1,
    })

    expect(withoutStream.nodes.map((node) => [node.nodeId, node.status])).toEqual(
      withStream.nodes.map((node) => [node.nodeId, node.status]),
    )
    expect(withoutStream.nodes.map((node) => node.status)).toEqual(
      withStream.nodes.map((node) => node.status),
    )
    expect(withoutStream.logs.map((line) => line.message)).toEqual(
      withStream.logs.map((line) => line.message),
    )
  })
})
