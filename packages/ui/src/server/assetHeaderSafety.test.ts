import * as jobik from '@jobik/core'
import { describe, expect, it } from 'vitest'
import { serveFlowRegistry } from './httpServer.js'
import { jobikAllRoutes } from './runRoutes.js'
import { registryOf } from './runTestSupport.js'
import { pushCleanup, setupCleanups } from './testSupport.js'
import { WIRE_MESSAGES } from './wireError.js'
import { findUnsafeValues } from './wireSafety.js'

setupCleanups()

/**
 * `GET /api/assets/:assetId` is the one route whose *headers* carry an author-declared value:
 * `entry.mime` comes from `jobik.asset({ mime })` and goes straight into `content-type`. The body
 * is bytes, so `assetRoutes.test.ts` sweeps nothing — which left the headers unpinned.
 *
 * The registry is process-global (`packages/core/src/run/assets.ts`), so an asset can be
 * registered directly and served without running a flow at all: what is under test is the route's
 * header handling, not how the bytes were produced.
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

async function serve() {
  const server = await serveFlowRegistry({
    registry: registryOf([]),
    host: '127.0.0.1',
    port: 0,
    routes: jobikAllRoutes,
  })
  pushCleanup(() => server.close())
  return server
}

/** Every header the response carried, as a plain object the sweep can walk. */
function headersOf(response: Response): Record<string, string> {
  return Object.fromEntries(response.headers.entries())
}

describe('GET /api/assets/:assetId headers', () => {
  it('leaks nothing through the response headers', async () => {
    const server = await serve()
    const descriptor = jobik.registerAsset({ data: PNG, mime: 'image/png' })
    const response = await fetch(`${server.url}/api/assets/${descriptor.id}`)
    expect(response.status).toBe(200)

    const headers = headersOf(response)
    expect(headers['content-type']).toBe('image/png')
    expect(headers['x-content-type-options']).toBe('nosniff')
    // The sweep `assetRoutes.test.ts` cannot do on a binary body. Needles are the roots this
    // process could disclose; a header is a string, so an absolute value is caught by shape too.
    expect(findUnsafeValues(headers, [process.cwd(), import.meta.dirname])).toEqual([])
  })

  it('turns a mime that would inject a header into the constant 500', async () => {
    const server = await serve()
    // The author declares the mime, so it is the one value on this route Jobik does not choose.
    // Node rejects a CR/LF in a header value, `writeHead` throws before anything is flushed, and
    // the router's catch answers its constant — no injected header, no thrown message.
    const descriptor = jobik.registerAsset({
      data: PNG,
      mime: 'image/png\r\nx-injected: C:/Users/someone/secrets',
    })
    const response = await fetch(`${server.url}/api/assets/${descriptor.id}`)
    expect(response.status).toBe(500)
    expect(response.headers.get('x-injected')).toBeNull()
    expect(await response.json()).toEqual({
      error: { _tag: null, message: WIRE_MESSAGES.internal },
    })
    expect(findUnsafeValues(headersOf(response), ['C:/Users/someone/secrets'])).toEqual([])
  })

  it('turns a bare newline in a mime into the same constant 500', async () => {
    const server = await serve()
    const descriptor = jobik.registerAsset({ data: PNG, mime: 'image/png\nx-injected: yes' })
    const response = await fetch(`${server.url}/api/assets/${descriptor.id}`)
    expect(response.status).toBe(500)
    expect(response.headers.get('x-injected')).toBeNull()
    expect(await response.json()).toEqual({
      error: { _tag: null, message: WIRE_MESSAGES.internal },
    })
  })
})
