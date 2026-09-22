import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import {
  publicationFixture,
  publicationSampleInput,
} from '../../../../examples/showcase/publication/fixtures.js'
import type { DiscoveredFlow } from './discovery.js'
import { type JobikServer, serveFlowRegistry } from './httpServer.js'
import * as runHistory from './runHistory.js'
import { inFlightRunCount } from './runRegistry.js'
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

/**
 * A cancel request the media-type gate accepts.
 *
 * The route takes no body, but every state-changing request must still declare `application/json`
 * — that is what keeps it un-forgeable from a cross-origin page, and `contentTypeGate.test.ts`
 * covers the refusal. `JobikClient.cancelRun` sends the same header.
 */
function cancel(server: JobikServer, runToken: string): Promise<Response> {
  return fetch(`${server.url}/api/runs/${encodeURIComponent(runToken)}/cancel`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * Poll `inFlightRunCount()` until it reaches `target`, bounded so a stuck abort fails the
 * assertion below rather than hanging the test until the suite's own timeout.
 */
async function waitForInFlightCount(target: number, timeoutMs = 2000): Promise<number> {
  const deadline = Date.now() + timeoutMs
  let count = inFlightRunCount()
  while (count !== target && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10))
    count = inFlightRunCount()
  }
  return count
}

describe('POST /api/flows/:id/run', () => {
  it('does not execute a handler if the client closed during initial archive creation', async () => {
    const { flow, cleanup } = await createProbeFlow('logging')
    pushCleanup(cleanup)
    const response = Object.assign(new EventEmitter(), {
      destroyed: false,
      writableEnded: false,
      writeHead: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    })
    const createArchive = runHistory.createRunArchive
    const archiveSpy = vi
      .spyOn(runHistory, 'createRunArchive')
      .mockImplementationOnce(async (args) => {
        const archive = await createArchive(args)
        // The socket closes before handleRun installs its normal close listener.
        response.destroyed = true
        response.emit('close')
        return archive
      })
    try {
      const route = jobikAllRoutes.find(
        (entry) => entry.method === 'POST' && entry.pattern === '/api/flows/:id/run',
      )
      if (route === undefined) throw new Error('Missing run route')
      const request = Readable.from([
        Buffer.from(JSON.stringify({ startId: 'start1', input: { text: 'must not execute' } })),
      ])
      await route.handle({
        request: request as IncomingMessage,
        response: response as unknown as ServerResponse,
        registry: registryOf([flow]),
        params: { id: flow.id },
        url: new URL('http://localhost/api/flows/' + flow.id + '/run'),
      })
      const runs = await runHistory.listPersistedRuns(flow)
      if (runs instanceof Error) throw runs
      expect(runs).toHaveLength(1)
      const record = await runHistory.readPersistedRun({ flow, runId: runs[0]?.runId ?? '' })
      expect(record).toMatchObject({
        status: 'cancelled',
        report: {
          status: 'cancelled',
          logs: [],
          nodes: expect.arrayContaining([
            expect.objectContaining({ nodeId: 'probe', status: 'skipped', output: null }),
          ]),
        },
      })
    } finally {
      archiveSpy.mockRestore()
    }
  })

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

  it('still ends with a terminal line when the settled event cannot be serialised', async () => {
    const flow = await temporaryFlow()
    const server = await serve(flow)
    const originalStringify = JSON.stringify
    const stringifySpy = vi
      .spyOn(JSON, 'stringify')
      .mockImplementation((value: unknown, ...rest: unknown[]) => {
        if (
          typeof value === 'object' &&
          value !== null &&
          (value as { type?: unknown }).type === 'run-settled'
        ) {
          throw new TypeError('simulated: the settled event cannot be serialised')
        }
        return (originalStringify as (...args: unknown[]) => string)(value, ...rest)
      })
    try {
      const response = await startRun(server, flow.id, {
        startId: publicationFixture.startId,
        input: publicationSampleInput,
      })
      const events = await collectNdjson(readNdjson(response))
      expect(events.length).toBeGreaterThan(0)
      // The doomed run-settled write never lands, so the last line is the stream's own fallback.
      const last = events.at(-1)
      expect(last?.type).toBe('run-failed')
      if (last?.type !== 'run-failed') return
      expect(last.error).toEqual({ _tag: null, message: WIRE_MESSAGES.internal })
    } finally {
      stringifySpy.mockRestore()
    }
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

  it('aborts the handler when the client disconnects, leaving no run registered', async () => {
    const { server, flow } = await serveProbe('parking')
    const baseline = inFlightRunCount()

    const controller = new AbortController()
    const response = await fetch(`${server.url}/api/flows/${flow.id}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ startId: 'start1', input: { text: 'wait' } }),
      signal: controller.signal,
    })
    const events = readNdjson(response)
    const first = await events.next()
    expect(first.value?.type).toBe('run-accepted')

    // The parking probe settles only when its run's own signal aborts, so the count actually
    // falling back to baseline proves `controller.abort()` reached it — not merely that some
    // `finally` ran on an already-settled run.
    controller.abort()

    expect(await waitForInFlightCount(baseline)).toBe(baseline)
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

    const cancelled = await cancel(server, first.value.runToken)
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
    const response = await cancel(server, 'not-a-token')
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
    const cancelled = await cancel(server, accepted.runToken)
    expect(cancelled.status).toBe(404)
  })
})
