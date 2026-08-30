import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  publicationFixture,
  publicationSampleInput,
} from '../../../../examples/publication/fixtures.js'
import type { DiscoveredFlow } from './discovery.js'
import { type JobikServer, serveFlowRegistry } from './httpServer.js'
import { jobikAllRoutes } from './runRoutes.js'
import {
  collectNdjson,
  createProbeFlow,
  type ProbeKind,
  readNdjson,
  registryOf,
} from './runTestSupport.js'
import type { RunWireEvent } from './runWire.js'
import { pushCleanup, setupCleanups, temporaryFlow } from './testSupport.js'
import { findUnsafeValues } from './wireSafety.js'

setupCleanups()

/**
 * Every root a payload from this fixture could leak, so a leak is caught even in a form the bare
 * absolute-path pattern would miss — a path embedded mid-string, for instance.
 */
function forbidden(flow: DiscoveredFlow): readonly string[] {
  return [
    publicationFixture.root,
    path.dirname(flow.documentPath),
    flow.documentPath,
    flow.bindingPath,
    path.dirname(flow.bindingPath),
  ]
}

async function serve(flow: DiscoveredFlow): Promise<JobikServer> {
  const server = await serveFlowRegistry({
    registry: registryOf([flow]),
    host: '127.0.0.1',
    port: 0,
    routes: jobikAllRoutes,
  })
  pushCleanup(() => server.close())
  return server
}

async function runEvents(args: {
  flow: DiscoveredFlow
  server: JobikServer
  startId: string
  input: unknown
}): Promise<RunWireEvent[]> {
  const response = await fetch(`${args.server.url}/api/flows/${args.flow.id}/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ startId: args.startId, input: args.input }),
  })
  return collectNdjson(readNdjson(response))
}

async function probeEvents(
  kind: ProbeKind,
): Promise<{ events: RunWireEvent[]; flow: DiscoveredFlow }> {
  const { flow, cleanup } = await createProbeFlow(kind)
  pushCleanup(cleanup)
  const server = await serve(flow)
  return {
    events: await runEvents({ flow, server, startId: 'start1', input: { text: 'hello' } }),
    flow,
  }
}

describe('the run stream is browser-safe', () => {
  it('leaks nothing on a successful run of the example flow', async () => {
    const flow = await temporaryFlow()
    const server = await serve(flow)
    const events = await runEvents({
      flow,
      server,
      startId: publicationFixture.startId,
      input: publicationSampleInput,
    })
    expect(events.length).toBeGreaterThan(0)
    for (const event of events) {
      expect(findUnsafeValues(event, forbidden(flow))).toEqual([])
    }
  })

  it('leaks nothing on a failed run, whose payload carries the trimmed stack', async () => {
    const { events, flow } = await probeEvents('throwing')
    expect(events.length).toBeGreaterThan(0)
    const settled = events.at(-1)
    expect(settled?.type).toBe('run-settled')
    if (settled?.type !== 'run-settled') return
    const failed = settled.report.nodes.find((node) => node.nodeId === 'probe')
    expect(failed?.error?._tag).toBe('NodeExecutionError')
    for (const event of events) {
      expect(findUnsafeValues(event, forbidden(flow))).toEqual([])
    }
  })

  it('leaks nothing on a run that produced log lines', async () => {
    const { events, flow } = await probeEvents('logging')
    expect(events.length).toBeGreaterThan(0)
    for (const event of events) {
      expect(findUnsafeValues(event, forbidden(flow))).toEqual([])
    }
  })

  it('leaks nothing from a failure that stopped the run before it started', async () => {
    const flow = await temporaryFlow()
    const server = await serve(flow)
    const events = await runEvents({ flow, server, startId: 'nope', input: {} })
    expect(events.length).toBeGreaterThan(0)
    for (const event of events) {
      expect(findUnsafeValues(event, forbidden(flow))).toEqual([])
    }
  })
})
