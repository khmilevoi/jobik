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
import { WIRE_MESSAGES } from './wireError.js'

setupCleanups()

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

async function serveProbe(kind: ProbeKind): Promise<{ server: JobikServer; flow: DiscoveredFlow }> {
  const { flow, cleanup } = await createProbeFlow(kind)
  pushCleanup(cleanup)
  return { server: await serve(flow), flow }
}

function startRun(server: JobikServer, flowId: string, body: unknown): Promise<Response> {
  return fetch(`${server.url}/api/flows/${flowId}/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/flows/:id/run', () => {
  it('streams the run and settles with a report whose binary field is a descriptor', async () => {
    const flow = await temporaryFlow()
    const server = await serve(flow)
    const response = await startRun(server, flow.id, {
      startId: publicationFixture.startId,
      input: publicationSampleInput,
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/x-ndjson')

    const events = await collectNdjson(readNdjson(response))
    expect(events[0].type).toBe('run-accepted')
    expect(events[1].type).toBe('run-started')

    const settled = events.at(-1)
    expect(settled?.type).toBe('run-settled')
    if (settled?.type !== 'run-settled') return
    expect(settled.report.status).toBe('ok')
    expect(settled.report.nodes.map((node) => node.nodeId)).toEqual(publicationFixture.nodeIds)

    const render = settled.report.nodes.find((node) => node.nodeId === 'render')
    expect(render?.output?.image).toEqual({
      type: 'Buffer',
      mime: 'image/png',
      bytes: expect.any(Number),
      id: expect.any(String),
    })
    expect(typeof render?.output?.caption).toBe('string')
  })

  it('emits a node-status transition per node and the log lines a handler produced', async () => {
    const { server, flow } = await serveProbe('logging')
    const response = await startRun(server, flow.id, {
      startId: 'start1',
      input: { text: 'hello' },
    })
    const events = await collectNdjson(readNdjson(response))

    const statuses = events.filter(
      (event): event is Extract<RunWireEvent, { type: 'node-status' }> =>
        event.type === 'node-status',
    )
    expect(statuses.some((event) => event.nodeId === 'probe' && event.status === 'running')).toBe(
      true,
    )
    expect(statuses.some((event) => event.nodeId === 'probe' && event.status === 'ok')).toBe(true)

    const logs = events.filter(
      (event): event is Extract<RunWireEvent, { type: 'node-log' }> => event.type === 'node-log',
    )
    expect(logs.map((event) => event.line.message)).toContain('probe saw hello')
  })

  it('attaches a relative trimmed stack to a handler that threw', async () => {
    const { server, flow } = await serveProbe('throwing')
    const response = await startRun(server, flow.id, {
      startId: 'start1',
      input: { text: 'hello' },
    })
    const events = await collectNdjson(readNdjson(response))

    const settled = events.at(-1)
    expect(settled?.type).toBe('run-settled')
    if (settled?.type !== 'run-settled') return
    expect(settled.report.status).toBe('failed')

    const failed = settled.report.nodes.find((node) => node.nodeId === 'probe')
    expect(failed?.status).toBe('failed')
    // The probe THREW, so the engine wrapped it and the taxonomy projection is what crossed.
    expect(failed?.error?._tag).toBe('NodeExecutionError')
    const error = failed?.error
    // `'frames' in error` is the narrowing that works: `AuthoredWireError['_tag']` is `string`, so
    // comparing `_tag` alone leaves it in the union and `frames` would not typecheck.
    if (error === null || error === undefined || !('frames' in error)) return
    expect(error.frames?.length ?? 0).toBeGreaterThan(0)
    expect(error.frames?.every((frame) => !path.isAbsolute(frame.file))).toBe(true)
    expect(error.frames?.some((frame) => frame.file.startsWith('runTestSupport.ts'))).toBe(true)
    expect(error.frames?.some((frame) => frame.fn.includes('raiseProbeFailure'))).toBe(true)
  })

  it('reports a start that does not exist as run-failed, not as a transport failure', async () => {
    const flow = await temporaryFlow()
    const server = await serve(flow)
    const response = await startRun(server, flow.id, { startId: 'nope', input: {} })
    expect(response.status).toBe(200)
    const events = await collectNdjson(readNdjson(response))
    const failed = events.at(-1)
    expect(failed?.type).toBe('run-failed')
    if (failed?.type !== 'run-failed') return
    expect(failed.error._tag).toBe('StartNotFoundError')
  })

  it('400s a body with no startId', async () => {
    const flow = await temporaryFlow()
    const server = await serve(flow)
    const response = await startRun(server, flow.id, { input: {} })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: { _tag: null, message: WIRE_MESSAGES.badBody } })
  })

  it('404s an unknown flow with an untagged body', async () => {
    const flow = await temporaryFlow()
    const server = await serve(flow)
    const response = await startRun(server, 'no-such-flow', { startId: 'start1', input: {} })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: { _tag: null, message: WIRE_MESSAGES.flowNotFound },
    })
  })
})

describe('POST /api/runs/:token/cancel', () => {
  it('cancels an in-flight run and settles it with the abort error', async () => {
    const { server, flow } = await serveProbe('parking')
    const response = await startRun(server, flow.id, { startId: 'start1', input: { text: 'wait' } })
    const events = readNdjson(response)

    const first = await events.next()
    expect(first.value?.type).toBe('run-accepted')
    if (first.value?.type !== 'run-accepted') return

    const cancelled = await fetch(`${server.url}/api/runs/${first.value.runToken}/cancel`, {
      method: 'POST',
    })
    expect(cancelled.status).toBe(200)
    expect(await cancelled.json()).toEqual({ cancelled: true })

    const rest = await collectNdjson(events)
    const settled = rest.at(-1)
    expect(settled?.type).toBe('run-settled')
    if (settled?.type !== 'run-settled') return
    expect(settled.report.status).toBe('cancelled')
    expect(settled.report.error?._tag).toBe('RunCancelledError')
  })

  it('404s an unknown token', async () => {
    const { server } = await serveProbe('logging')
    const response = await fetch(`${server.url}/api/runs/not-a-token/cancel`, { method: 'POST' })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: { _tag: null, message: WIRE_MESSAGES.notFound },
    })
  })

  it('404s a token whose run already settled', async () => {
    const { server, flow } = await serveProbe('logging')
    const response = await startRun(server, flow.id, { startId: 'start1', input: { text: 'hi' } })
    const events = await collectNdjson(readNdjson(response))
    const accepted = events[0]
    expect(accepted.type).toBe('run-accepted')
    if (accepted.type !== 'run-accepted') return
    const cancelled = await fetch(`${server.url}/api/runs/${accepted.runToken}/cancel`, {
      method: 'POST',
    })
    expect(cancelled.status).toBe(404)
  })
})
