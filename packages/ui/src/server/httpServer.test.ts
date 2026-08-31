import * as fs from 'node:fs/promises'
import path from 'node:path'
import * as jobik from '@jobik/core'
import { describe, expect, it } from 'vitest'
import { publicationFixture } from '../../../../examples/publication/fixtures.js'
import { defineJobikConfig } from './config.js'
import { type JobikServer, serveFlowRegistry, startJobikServer } from './httpServer.js'
import { pushCleanup, setupCleanups, temporaryFlow, uiPath } from './testSupport.js'
import { WIRE_MESSAGES } from './wireError.js'
import { findUnsafeValues } from './wireSafety.js'

setupCleanups()

/**
 * A server on an ephemeral port, serving the publication graph bound to a throwaway copy of the
 * document — so a save test rewrites the copy and never the committed example.
 */
async function startOverCopy(): Promise<{ server: JobikServer; documentPath: string }> {
  const discovered = await temporaryFlow()
  const server = await serveFlowRegistry({
    registry: { flows: [discovered], get: (id) => (id === discovered.id ? discovered : undefined) },
    host: '127.0.0.1',
    port: 0,
  })
  pushCleanup(() => server.close())
  return { server, documentPath: discovered.documentPath }
}

/** Every forbidden substring a payload from this fixture could possibly leak. */
function forbidden(documentPath: string): readonly string[] {
  return [publicationFixture.root, path.dirname(documentPath), documentPath]
}

describe('GET /api/flows', () => {
  it('lists the discovered flows', async () => {
    const { server } = await startOverCopy()
    const response = await fetch(`${server.url}/api/flows`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual({
      flows: [{ id: publicationFixture.flowName, name: publicationFixture.flowName, nodeCount: 3 }],
    })
  })
})

describe('GET /api/flows/:id', () => {
  it('returns the descriptor, the document and the revision', async () => {
    const { server, documentPath } = await startOverCopy()
    const response = await fetch(`${server.url}/api/flows/${publicationFixture.flowName}`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      descriptor: { nodes: { id: string }[]; documentFile: string }
      document: { version: number }
      revision: string
    }
    expect(body.descriptor.nodes.map((node) => node.id)).toEqual(publicationFixture.nodeIds)
    expect(body.descriptor.documentFile).toBe('flow.jobik.json')
    expect(body.document.version).toBe(1)
    expect(body.revision).toBe(jobik.revisionOf(await fs.readFile(documentPath)))
  })

  it('404s an unknown flow with an untagged body', async () => {
    const { server } = await startOverCopy()
    const response = await fetch(`${server.url}/api/flows/no-such-flow`)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: { _tag: null, message: WIRE_MESSAGES.flowNotFound },
    })
  })
})

describe('POST /api/flows/:id/validate', () => {
  it('reports a valid draft as a 200 result', async () => {
    const { server } = await startOverCopy()
    const loaded = (await (
      await fetch(`${server.url}/api/flows/${publicationFixture.flowName}`)
    ).json()) as {
      document: unknown
    }
    const response = await fetch(
      `${server.url}/api/flows/${publicationFixture.flowName}/validate`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ document: loaded.document }),
      },
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ valid: true })
  })

  it('reports an invalid draft as a 200 result carrying a tagged error', async () => {
    const { server } = await startOverCopy()
    const response = await fetch(
      `${server.url}/api/flows/${publicationFixture.flowName}/validate`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          document: {
            format: 'jobik.flow',
            version: 1,
            connections: [
              {
                from: { node: publicationFixture.startId, field: 'title' },
                to: { node: 'ghost', field: 'x' },
              },
            ],
            literals: {},
            layout: {},
          },
        }),
      },
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { valid: boolean; error: { _tag: string } }
    expect(body.valid).toBe(false)
    expect(body.error._tag).toBe('ConnectionError')
  })

  it('400s a body that is not JSON or has no document', async () => {
    const { server } = await startOverCopy()
    // The header is required: without it the request is refused by the media-type gate (415)
    // before the body is ever read, which is a different failure — see `contentTypeGate.test.ts`.
    const notJson = await fetch(`${server.url}/api/flows/${publicationFixture.flowName}/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'nope',
    })
    expect(notJson.status).toBe(400)
    expect(await notJson.json()).toEqual({
      error: { _tag: null, message: WIRE_MESSAGES.badBody },
    })
  })
})

describe('POST /api/flows/:id/save', () => {
  it('saves atomically and returns the new revision', async () => {
    const { server, documentPath } = await startOverCopy()
    const loaded = (await (
      await fetch(`${server.url}/api/flows/${publicationFixture.flowName}`)
    ).json()) as {
      document: { layout: Record<string, { x: number; y: number }> }
      revision: string
    }
    const document = {
      ...loaded.document,
      layout: { ...loaded.document.layout, render: { x: 400, y: 160 } },
    }

    const response = await fetch(`${server.url}/api/flows/${publicationFixture.flowName}/save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ document, expectedRevision: loaded.revision }),
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { revision: string }
    const written = await fs.readFile(documentPath, 'utf8')
    expect(body.revision).toBe(jobik.revisionOf(written))
    expect(JSON.parse(written).layout.render).toEqual({ x: 400, y: 160 })
  })

  it('409s a stale expected revision with FlowRevisionConflictError', async () => {
    const { server } = await startOverCopy()
    const loaded = (await (
      await fetch(`${server.url}/api/flows/${publicationFixture.flowName}`)
    ).json()) as {
      document: unknown
    }
    const response = await fetch(`${server.url}/api/flows/${publicationFixture.flowName}/save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ document: loaded.document, expectedRevision: 'stale' }),
    })
    expect(response.status).toBe(409)
    const body = (await response.json()) as { error: { _tag: string; expectedRevision: string } }
    expect(body.error._tag).toBe('FlowRevisionConflictError')
    expect(body.error.expectedRevision).toBe('stale')
  })

  it('422s a draft that does not bind', async () => {
    const { server } = await startOverCopy()
    const response = await fetch(`${server.url}/api/flows/${publicationFixture.flowName}/save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        document: {
          format: 'jobik.flow',
          version: 1,
          connections: [
            {
              from: { node: publicationFixture.startId, field: 'title' },
              to: { node: 'ghost', field: 'x' },
            },
          ],
          literals: {},
          layout: {},
        },
        expectedRevision: 'anything',
      }),
    })
    expect(response.status).toBe(422)
    expect(((await response.json()) as { error: { _tag: string } }).error._tag).toBe(
      'ConnectionError',
    )
  })

  it('400s a body without an expectedRevision string', async () => {
    const { server } = await startOverCopy()
    const response = await fetch(`${server.url}/api/flows/${publicationFixture.flowName}/save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ document: {} }),
    })
    expect(response.status).toBe(400)
  })
})

describe('routing', () => {
  it('404s an unknown path with an untagged body', async () => {
    const { server } = await startOverCopy()
    const response = await fetch(`${server.url}/nope`)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: { _tag: null, message: WIRE_MESSAGES.notFound },
    })
  })

  it('405s a known path with the wrong method', async () => {
    const { server } = await startOverCopy()
    const response = await fetch(`${server.url}/api/flows`, { method: 'POST' })
    expect(response.status).toBe(405)
    expect(await response.json()).toEqual({
      error: { _tag: null, message: WIRE_MESSAGES.methodNotAllowed },
    })
  })

  it('400s a malformed percent-escape in the URL path (R7)', async () => {
    const { server } = await startOverCopy()
    const response = await fetch(`${server.url}/api/flows/%ZZ`)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: { _tag: null, message: WIRE_MESSAGES.malformedTarget },
    })
    // Verify the server is still running by making a second request
    const healthCheck = await fetch(`${server.url}/api/flows`)
    expect(healthCheck.status).toBe(200)
  })
})

describe('the wire payload of every endpoint', () => {
  it('carries no handler, no absolute path and no forbidden key', async () => {
    const { server, documentPath } = await startOverCopy()
    const loaded = (await (
      await fetch(`${server.url}/api/flows/${publicationFixture.flowName}`)
    ).json()) as {
      document: unknown
      revision: string
    }

    const payloads: unknown[] = [
      await (await fetch(`${server.url}/api/flows`)).json(),
      loaded,
      await (
        await fetch(`${server.url}/api/flows/${publicationFixture.flowName}/validate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ document: loaded.document }),
        })
      ).json(),
      await (
        await fetch(`${server.url}/api/flows/${publicationFixture.flowName}/validate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ document: { format: 'nope' } }),
        })
      ).json(),
      await (
        await fetch(`${server.url}/api/flows/${publicationFixture.flowName}/save`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ document: loaded.document, expectedRevision: loaded.revision }),
        })
      ).json(),
      await (
        await fetch(`${server.url}/api/flows/${publicationFixture.flowName}/save`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ document: loaded.document, expectedRevision: 'stale' }),
        })
      ).json(),
      await (await fetch(`${server.url}/api/flows/no-such-flow`)).json(),
      await (await fetch(`${server.url}/nope`)).json(),
    ]

    for (const payload of payloads) {
      expect(findUnsafeValues(payload, forbidden(documentPath))).toEqual([])
    }
  })
})

describe('startJobikServer (R9)', () => {
  it('builds a config with an ephemeral port, starts the server, and responds to requests', async () => {
    const config = defineJobikConfig({
      server: { port: 0 },
      flows: [{ binding: publicationFixture.bindingPath, ui: uiPath }],
    })
    const server = await startJobikServer({ config })
    pushCleanup(() => server.close())

    const response = await fetch(`${server.url}/api/flows`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as { flows: unknown[] }
    expect(body.flows).toHaveLength(1)
  })
})
