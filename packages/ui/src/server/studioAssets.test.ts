import * as fs from 'node:fs/promises'
import * as http from 'node:http'
import * as os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { publicationFixture } from '../../../../examples/publication/fixtures.js'
import { type JobikServer, serveFlowRegistry } from './httpServer.js'
import { jobikAllRoutes } from './runRoutes.js'
import { createStudioAssetRoutes, jobikStudioServerRoutes } from './studioAssets.js'
import { committedFlow } from './testSupport.js'
import { WIRE_MESSAGES } from './wireError.js'

/**
 * The static Studio route.
 *
 * Every test runs against a bundle written into a temp directory rather than against
 * `packages/ui/dist/studio`, so the suite neither needs nor triggers a `vite build`. The one thing
 * a fixture cannot stand in for — that the real bundle is found relative to the module and not to
 * `process.cwd()` — is exercised by `pnpm dev` instead.
 *
 * `SECRET` lives one level ABOVE the bundle: a traversal that escapes would serve it, so its
 * absence from a response body is the assertion, not just the status code.
 */

const SECRET = 'if you can read this, the bundle is not confined'
const ASSET_JS = 'export const studio = 1\n'
const INDEX_HTML = '<!doctype html><title>Jobik Studio</title><div id="root"></div>'

let root: string
let bundleDir: string
const servers: JobikServer[] = []

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'jobik-studio-assets-'))
  bundleDir = path.join(root, 'studio')
  await fs.mkdir(path.join(bundleDir, 'assets'), { recursive: true })
  await fs.writeFile(path.join(root, 'secret.txt'), SECRET, 'utf8')
  await fs.writeFile(path.join(bundleDir, 'index.html'), INDEX_HTML, 'utf8')
  await fs.writeFile(path.join(bundleDir, 'assets', 'index-Dk9x1a.js'), ASSET_JS, 'utf8')
  await fs.writeFile(path.join(bundleDir, 'assets', 'index-Dk9x1a.css'), 'body{margin:0}', 'utf8')
})

afterAll(async () => {
  while (servers.length > 0) await servers.pop()?.close()
  await fs.rm(root, { recursive: true, force: true })
})

/** A server over the committed publication flow, with the API routes first and the bundle last. */
async function startStudio(options: { readonly bundleDir?: string } = {}): Promise<JobikServer> {
  const discovered = await committedFlow()
  const server = await serveFlowRegistry({
    registry: { flows: [discovered], get: (id) => (id === discovered.id ? discovered : undefined) },
    host: '127.0.0.1',
    port: 0,
    routes: [...jobikAllRoutes, ...createStudioAssetRoutes(options)],
  })
  servers.push(server)
  return server
}

/**
 * A GET whose request target is sent VERBATIM.
 *
 * `fetch` parses its argument as a WHATWG URL, which collapses `/../` before a byte leaves the
 * process — so it cannot express the attack at all. `http.request` writes the path as given.
 */
function rawGet(
  server: JobikServer,
  target: string,
): Promise<{ status: number; contentType: string; body: string }> {
  const origin = new URL(server.url)
  return new Promise((resolve, reject) => {
    const request = http.request(
      { host: origin.hostname, port: Number(origin.port), method: 'GET', path: target },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            contentType: response.headers['content-type'] ?? '',
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        )
      },
    )
    request.on('error', reject)
    request.end()
  })
}

describe('the Studio bundle', () => {
  it('serves index.html at the root, uncached', async () => {
    const server = await startStudio({ bundleDir })
    const response = await fetch(`${server.url}/`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe(INDEX_HTML)
  })

  it('serves index.html by name too', async () => {
    const server = await startStudio({ bundleDir })
    const response = await fetch(`${server.url}/index.html`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(INDEX_HTML)
  })

  it('serves a hashed asset as javascript, cached forever', async () => {
    const server = await startStudio({ bundleDir })
    const response = await fetch(`${server.url}/assets/index-Dk9x1a.js`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(await response.text()).toBe(ASSET_JS)
  })

  it('serves a stylesheet as css', async () => {
    const server = await startStudio({ bundleDir })
    const response = await fetch(`${server.url}/assets/index-Dk9x1a.css`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/css; charset=utf-8')
  })

  it('404s a path the bundle does not hold — there is no SPA fallback', async () => {
    const server = await startStudio({ bundleDir })
    const response = await fetch(`${server.url}/flows/publication`)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: { _tag: null, message: WIRE_MESSAGES.notFound },
    })
  })
})

describe('path confinement', () => {
  // Raw `..`, percent-encoded `..`, a Windows separator, an absolute path, and a NUL. Every one
  // must be a 404 that carries none of the secret.
  const attacks = [
    '/../secret.txt',
    '/..%2Fsecret.txt',
    '/%2e%2e/secret.txt',
    '/%2e%2e%2fsecret.txt',
    '/assets/../../secret.txt',
    '/..%5Csecret.txt',
    '/secret.txt%00.js',
  ]

  for (const target of attacks) {
    it(`refuses '${target}'`, async () => {
      const server = await startStudio({ bundleDir })
      const response = await rawGet(server, target)
      expect(response.body).not.toContain(SECRET)
      expect(response.status).toBe(404)
      expect(JSON.parse(response.body)).toEqual({
        error: { _tag: null, message: WIRE_MESSAGES.notFound },
      })
    })
  }

  it('refuses an absolute path as a single segment', async () => {
    const server = await startStudio({ bundleDir })
    const response = await rawGet(server, `/${encodeURIComponent(path.join(root, 'secret.txt'))}`)
    expect(response.body).not.toContain(SECRET)
    expect(response.status).toBe(404)
  })
})

describe('the API is unaffected', () => {
  it('still lists flows', async () => {
    const server = await startStudio({ bundleDir })
    const response = await fetch(`${server.url}/api/flows`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    const body = (await response.json()) as { flows: { id: string }[] }
    expect(body.flows.map((flow) => flow.id)).toEqual([publicationFixture.flowName])
  })

  it('still 404s an unknown /api path with JSON, never with the page', async () => {
    const server = await startStudio({ bundleDir })
    const response = await fetch(`${server.url}/api/nope`)
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toEqual({
      error: { _tag: null, message: WIRE_MESSAGES.notFound },
    })
  })

  it('still 405s a known API path with the wrong method', async () => {
    const server = await startStudio({ bundleDir })
    const response = await fetch(`${server.url}/api/flows`, { method: 'POST' })
    expect(response.status).toBe(405)
    expect(await response.json()).toEqual({
      error: { _tag: null, message: WIRE_MESSAGES.methodNotAllowed },
    })
  })

  it('keeps the wildcard last, after every API route', () => {
    const patterns = jobikStudioServerRoutes.map((route) => route.pattern)
    expect(patterns.at(-1)).toBe('/*')
    expect(patterns.slice(0, -1).every((pattern) => pattern.startsWith('/api/'))).toBe(true)
  })
})

describe('an unbuilt bundle', () => {
  it('answers with an actionable plain-text 503, not a stack', async () => {
    const server = await startStudio({ bundleDir: path.join(root, 'never-built') })
    const response = await fetch(`${server.url}/`)
    expect(response.status).toBe(503)
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    const body = await response.text()
    expect(body).toContain('has not been built')
    expect(body).toContain('build:studio')
    // Actionable, but never at the cost of the one rule: no absolute path on the wire.
    expect(body).not.toContain(root)
  })

  it('leaves the API answering', async () => {
    const server = await startStudio({ bundleDir: path.join(root, 'never-built') })
    const response = await fetch(`${server.url}/api/flows`)
    expect(response.status).toBe(200)
  })
})
