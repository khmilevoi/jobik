import type { FlowDocument } from '@jobik/core'
import { describe, expect, it } from 'vitest'
import { JobikServerError, JobikTransportError } from './errors.js'
import { createJobikClient } from './JobikClient.js'
import { NdjsonParseError } from './ndjson.js'
import { isRevisionConflictPayload } from './wire.js'

const DOCUMENT = {
  format: 'jobik.flow',
  version: 1,
  connections: [],
  literals: {},
  layout: {},
} as unknown as FlowDocument

type Call = { readonly url: string; readonly init: RequestInit | undefined }

function stubFetch(handler: (call: Call) => Response): {
  fetch: typeof globalThis.fetch
  calls: Call[]
} {
  const calls: Call[] = []
  const fetchStub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init }
    calls.push(call)
    return handler(call)
  }) as typeof globalThis.fetch
  return { fetch: fetchStub, calls }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('createJobikClient', () => {
  it('lists flows from GET /api/flows', async () => {
    const { fetch, calls } = stubFetch(() =>
      json({ flows: [{ id: 'publication', name: 'publication', nodeCount: 3 }] }),
    )
    const client = createJobikClient({ baseUrl: 'http://localhost:4318', fetch })

    const flows = await client.listFlows()

    expect(calls[0]?.url).toBe('http://localhost:4318/api/flows')
    expect(flows).toEqual([{ id: 'publication', name: 'publication', nodeCount: 3 }])
  })

  it('loads a flow from GET /api/flows/:id', async () => {
    const { fetch, calls } = stubFetch(() =>
      json({
        descriptor: {
          id: 'publication',
          name: 'publication',
          documentFile: 'flow.jobik.json',
          nodes: [],
          startIds: ['start1'],
        },
        document: DOCUMENT,
        revision: 'rev-1',
      }),
    )
    const client = createJobikClient({ baseUrl: '', fetch })

    const loaded = await client.loadFlow('publication')

    expect(calls[0]?.url).toBe('/api/flows/publication')
    expect(loaded).not.toBeInstanceOf(Error)
    if (loaded instanceof Error) return
    expect(loaded.revision).toBe('rev-1')
  })

  it('posts a draft to /validate and returns the invalid payload as a value', async () => {
    const { fetch, calls } = stubFetch(() =>
      json({
        valid: false,
        error: { _tag: 'ConnectionError', message: 'cycle', cycle: ['a', 'b'] },
      }),
    )
    const client = createJobikClient({ fetch })

    const result = await client.validate('publication', DOCUMENT)

    expect(calls[0]?.url).toBe('/api/flows/publication/validate')
    expect(calls[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ document: DOCUMENT })
    expect(result).toEqual({
      valid: false,
      error: { _tag: 'ConnectionError', message: 'cycle', cycle: ['a', 'b'] },
    })
  })

  it('sends the expected revision on save and returns the new one', async () => {
    const { fetch, calls } = stubFetch(() => json({ revision: 'rev-2' }))
    const client = createJobikClient({ fetch })

    const saved = await client.save('publication', DOCUMENT, 'rev-1')

    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      document: DOCUMENT,
      expectedRevision: 'rev-1',
    })
    expect(saved).toEqual({ revision: 'rev-2' })
  })

  it('returns a JobikServerError carrying the untouched conflict payload on 409', async () => {
    const { fetch } = stubFetch(() =>
      json(
        {
          error: {
            _tag: 'FlowRevisionConflictError',
            message: 'The flow document changed on disk: expected revision rev-1 but found rev-9',
            expectedRevision: 'rev-1',
            actualRevision: 'rev-9',
          },
        },
        409,
      ),
    )
    const client = createJobikClient({ fetch })

    const saved = await client.save('publication', DOCUMENT, 'rev-1')

    expect(saved).toBeInstanceOf(JobikServerError)
    if (!(saved instanceof JobikServerError)) return
    expect(saved.status).toBe(409)
    expect(isRevisionConflictPayload(saved.payload)).toBe(true)
    expect(saved.payload.actualRevision).toBe('rev-9')
  })

  it('returns a JobikTransportError when fetch rejects', async () => {
    const fetchStub = (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof globalThis.fetch
    const client = createJobikClient({ fetch: fetchStub })

    const flows = await client.listFlows()

    expect(flows).toBeInstanceOf(JobikTransportError)
  })

  it('streams run events, first line first', async () => {
    const body =
      '{"type":"run-accepted","runToken":"tok"}\n' +
      '{"type":"run-started","runNumber":7,"flowName":"publication","startId":"start1","nodeCount":3}\n' +
      '{"type":"run-failed","error":{"_tag":null,"message":"Internal server error"}}\n'
    const { fetch, calls } = stubFetch(
      () =>
        new Response(body, {
          headers: { 'content-type': 'application/x-ndjson; charset=utf-8' },
        }),
    )
    const client = createJobikClient({ fetch })

    const stream = await client.startRun({
      flowId: 'publication',
      startId: 'start1',
      input: { title: 't', markdown: 'm' },
    })

    expect(calls[0]?.url).toBe('/api/flows/publication/run')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      startId: 'start1',
      input: { title: 't', markdown: 'm' },
    })
    expect(stream).not.toBeInstanceOf(Error)
    if (stream instanceof Error) return

    const seen = []
    for await (const event of stream) seen.push(event.type)
    expect(seen).toEqual(['run-accepted', 'run-started', 'run-failed'])
  })

  it('returns the server error as a value when the run cannot start', async () => {
    const { fetch } = stubFetch(() =>
      json(
        {
          error: {
            _tag: 'StartNotFoundError',
            message: 'no such start',
            startId: 'nope',
            available: ['start1'],
          },
        },
        404,
      ),
    )
    const client = createJobikClient({ fetch })

    const stream = await client.startRun({ flowId: 'publication', startId: 'nope', input: {} })

    expect(stream).toBeInstanceOf(JobikServerError)
  })

  it('cancels a run by its token', async () => {
    const { fetch, calls } = stubFetch(() => json({ cancelled: true }))
    const client = createJobikClient({ fetch })

    const cancelled = await client.cancelRun('tok')

    expect(calls[0]?.url).toBe('/api/runs/tok/cancel')
    expect(calls[0]?.init?.method).toBe('POST')
    expect(cancelled).toBe(true)
  })

  it('builds asset and extension bundle URLs without a request', () => {
    const client = createJobikClient({ baseUrl: 'http://127.0.0.1:4318' })

    expect(client.assetUrl({ type: 'Buffer', mime: 'image/png', bytes: 12, id: 'a/b' })).toBe(
      'http://127.0.0.1:4318/api/assets/a%2Fb',
    )
    expect(client.extensionBundleUrl('publication')).toBe(
      'http://127.0.0.1:4318/api/flows/publication/ui.js',
    )
  })

  it('falls back to the unreadable payload when a non-2xx body is not JSON', async () => {
    const { fetch } = stubFetch(() => new Response('not json at all', { status: 500 }))
    const client = createJobikClient({ fetch })

    const flows = await client.listFlows()

    expect(flows).toBeInstanceOf(JobikServerError)
    if (!(flows instanceof JobikServerError)) return
    expect(flows.status).toBe(500)
    expect(flows.payload).toEqual({ _tag: null, message: 'Internal server error' })
  })

  it('returns a JobikTransportError when a 2xx JSON body cannot be parsed', async () => {
    const { fetch } = stubFetch(() => new Response('not json at all', { status: 200 }))
    const client = createJobikClient({ fetch })

    const flows = await client.listFlows()

    expect(flows).toBeInstanceOf(JobikTransportError)
  })

  it('does not swallow a run stream that dies mid-run: the generator still throws to its consumer', async () => {
    const body = '{"type":"run-accepted","runToken":"tok"}\n' + '{"type":"not-a-real-event"}\n'
    const { fetch } = stubFetch(
      () =>
        new Response(body, {
          headers: { 'content-type': 'application/x-ndjson; charset=utf-8' },
        }),
    )
    const client = createJobikClient({ fetch })

    const stream = await client.startRun({ flowId: 'publication', startId: 'start1', input: {} })

    expect(stream).not.toBeInstanceOf(Error)
    if (stream instanceof Error) return

    const consume = async () => {
      const seen = []
      for await (const event of stream) seen.push(event.type)
      return seen
    }

    await expect(consume()).rejects.toBeInstanceOf(NdjsonParseError)
  })
})
