import * as fs from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  publicationFixture,
  publicationSampleInput,
} from '../../../../examples/showcase/publication/fixtures.js'
import type { DiscoveredFlow } from './discovery.js'
import { type JobikServer, serveFlowRegistry } from './httpServer.js'
import { jobikAllRoutes } from './runRoutes.js'
import { collectNdjson, createProbeFlow, readNdjson, registryOf } from './runTestSupport.js'
import { pushCleanup, setupCleanups, temporaryFlow } from './testSupport.js'
import { WIRE_MESSAGES } from './wireError.js'

setupCleanups()

/**
 * The cross-origin side-effect gate.
 *
 * The Studio's server has no CSRF token, no `Origin` check and no session — it does not need one,
 * as long as no state-changing request can be made **without a preflight**. A `POST` whose
 * `content-type` is one of the three CORS-simple values (`text/plain`,
 * `application/x-www-form-urlencoded`, `multipart/form-data`) is sent by the browser with no
 * preflight at all: the response is unreadable to the attacker's page, but the *effect* has
 * already happened. Binding to `127.0.0.1` does not help — the attacker's page runs in the
 * victim's own browser, which is on `127.0.0.1` too.
 *
 * `application/json` is not in that list, so requiring it turns every state-changing request into
 * a preflighted one, and this server answers no `OPTIONS` — the last test here pins that.
 *
 * The gate is over the METHOD, not over the presence of a body: `POST /api/runs/:token/cancel`
 * carries no body and is state-changing all the same.
 */

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

async function servePublication(): Promise<{ server: JobikServer; documentPath: string }> {
  const flow = await temporaryFlow()
  return { server: await serve(flow), documentPath: flow.documentPath }
}

const flowId = publicationFixture.flowName

/** The body a same-origin client sends. `JSON.parse`able, and a valid save on this fixture. */
async function loadedDocument(server: JobikServer): Promise<{
  document: { layout: Record<string, { x: number; y: number }> }
  revision: string
}> {
  const response = await fetch(`${server.url}/api/flows/${flowId}`)
  return (await response.json()) as {
    document: { layout: Record<string, { x: number; y: number }> }
    revision: string
  }
}

const REFUSED = { error: { _tag: null, message: WIRE_MESSAGES.badBody } }

describe('a CORS-simple POST cannot reach a side effect', () => {
  it('refuses a save sent as text/plain, and the document on disk is untouched', async () => {
    const { server, documentPath } = await servePublication()
    const loaded = await loadedDocument(server)
    const before = await fs.readFile(documentPath, 'utf8')

    // Exactly what `fetch(url, { method: 'POST', body })` sends from a page on another origin:
    // no custom header, so `text/plain;charset=UTF-8` and no preflight.
    const response = await fetch(`${server.url}/api/flows/${flowId}/save`, {
      method: 'POST',
      body: JSON.stringify({
        document: {
          ...loaded.document,
          layout: { ...loaded.document.layout, render: { x: 999, y: 999 } },
        },
        expectedRevision: loaded.revision,
      }),
    })

    expect(response.status).toBe(415)
    expect(await response.json()).toEqual(REFUSED)
    expect(await fs.readFile(documentPath, 'utf8')).toBe(before)
  })

  it('refuses a validate sent as text/plain', async () => {
    const { server } = await servePublication()
    const loaded = await loadedDocument(server)
    const response = await fetch(`${server.url}/api/flows/${flowId}/validate`, {
      method: 'POST',
      body: JSON.stringify({ document: loaded.document }),
    })
    expect(response.status).toBe(415)
    expect(await response.json()).toEqual(REFUSED)
  })

  it('refuses a run sent as text/plain, before any node executes', async () => {
    const { server } = await servePublication()
    // JSON bytes under a CORS-simple media type. Nothing but the declared type distinguishes this
    // from the request the Studio sends, which is the whole point: before the gate this opened a
    // real NDJSON stream and ran the flow.
    const response = await fetch(`${server.url}/api/flows/${flowId}/run`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({
        startId: publicationFixture.startId,
        input: publicationSampleInput,
      }),
    })
    expect(response.status).toBe(415)
    // Not the NDJSON stream: the run never opened one.
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual(REFUSED)
  })

  it('refuses a cancel with no content-type at all, leaving the run in flight', async () => {
    const { flow, cleanup } = await createProbeFlow('parking')
    pushCleanup(cleanup)
    const server = await serve(flow)

    const started = await fetch(`${server.url}/api/flows/${flow.id}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ startId: 'start1', input: { text: 'wait' } }),
    })
    const events = readNdjson(started)
    const accepted = await events.next()
    expect(accepted.value?.type).toBe('run-accepted')
    if (accepted.value?.type !== 'run-accepted') return

    const refused = await fetch(`${server.url}/api/runs/${accepted.value.runToken}/cancel`, {
      method: 'POST',
    })
    expect(refused.status).toBe(415)
    expect(await refused.json()).toEqual(REFUSED)

    // Still cancellable by a client that declares itself, which is what proves the request above
    // was refused by the gate and not because the token had already gone.
    const cancelled = await fetch(`${server.url}/api/runs/${accepted.value.runToken}/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    })
    expect(cancelled.status).toBe(200)
    await collectNdjson(events)
  })
})

describe('the forms a legitimate client sends are accepted', () => {
  it('accepts application/json', async () => {
    const { server } = await servePublication()
    const loaded = await loadedDocument(server)
    const response = await fetch(`${server.url}/api/flows/${flowId}/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ document: loaded.document }),
    })
    expect(response.status).toBe(200)
  })

  it('accepts a charset parameter and does not care about case or spacing', async () => {
    const { server } = await servePublication()
    const loaded = await loadedDocument(server)
    for (const declared of [
      'application/json; charset=utf-8',
      'application/json;charset=UTF-8',
      'APPLICATION/JSON',
      '  application/json  ',
    ]) {
      const response = await fetch(`${server.url}/api/flows/${flowId}/validate`, {
        method: 'POST',
        headers: { 'content-type': declared },
        body: JSON.stringify({ document: loaded.document }),
      })
      expect([declared, response.status]).toEqual([declared, 200])
    }
  })

  it('leaves a malformed JSON body as a 400, not a media-type refusal', async () => {
    const { server } = await servePublication()
    const response = await fetch(`${server.url}/api/flows/${flowId}/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'nope',
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual(REFUSED)
  })
})

describe('the gate does not disturb the rest of the surface', () => {
  it('asks nothing of a GET', async () => {
    const { server } = await servePublication()
    expect((await fetch(`${server.url}/api/flows`)).status).toBe(200)
    expect((await fetch(`${server.url}/api/flows/${flowId}`)).status).toBe(200)
  })

  it('still answers an unknown path 404 and a wrong method 405, ahead of the gate', async () => {
    const { server } = await servePublication()
    const unknown = await fetch(`${server.url}/api/nope`, { method: 'POST', body: 'x' })
    expect(unknown.status).toBe(404)
    const wrongMethod = await fetch(`${server.url}/api/flows`, { method: 'POST', body: 'x' })
    expect(wrongMethod.status).toBe(405)
  })

  it('does not answer the preflight the gate forces the browser to send', async () => {
    const { server } = await servePublication()
    const preflight = await fetch(`${server.url}/api/flows/${flowId}/save`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://evil.example',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    })
    expect(preflight.status).toBe(405)
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull()
    expect(preflight.headers.get('access-control-allow-headers')).toBeNull()
  })
})
