import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { publicationFixture } from '../../../../examples/publication/fixtures.js'
import { buildExtensionBundle, clearExtensionBundleCache } from './extensionBundle.js'
import { serveFlowRegistry } from './httpServer.js'
import { jobikAllRoutes } from './runRoutes.js'
import { registryOf } from './runTestSupport.js'
import { pushCleanup, setupCleanups, temporaryFlow, uiPath } from './testSupport.js'
import { WIRE_MESSAGES } from './wireError.js'

setupCleanups()

/** Rolldown's first build in a process is the slow one; the shared 20 s project timeout is tight. */
const BUILD_TIMEOUT = 120_000

describe('buildExtensionBundle', () => {
  it('bundles the flow-local extension with React and @jobik/ui left external', {
    timeout: BUILD_TIMEOUT,
  }, async () => {
    clearExtensionBundleCache()
    const code = await buildExtensionBundle({ uiPath })
    expect(code).not.toBeInstanceOf(Error)
    if (code instanceof Error) return

    // The flow's own modules are inlined...
    expect(code).toContain('RenderedImage')
    // ...and the two things the Studio already has stay bare imports.
    expect(code).toMatch(/from\s*["']@jobik\/ui["']/)
    expect(code).toMatch(/["']react\/jsx-runtime["']/)
    // Nothing about this machine crosses to the browser.
    expect(code.includes(publicationFixture.root)).toBe(false)
  })

  it('memoises a successful bundle so a second request does not rebuild', {
    timeout: BUILD_TIMEOUT,
  }, async () => {
    clearExtensionBundleCache()
    const [first, second] = await Promise.all([
      buildExtensionBundle({ uiPath }),
      buildExtensionBundle({ uiPath }),
    ])
    expect(first).toBe(second)
  })

  it('returns the failure as a value when the entrypoint cannot be built', {
    timeout: BUILD_TIMEOUT,
  }, async () => {
    clearExtensionBundleCache()
    const missing = path.resolve(publicationFixture.root, 'no-such-flow-ui.tsx')
    expect(await buildExtensionBundle({ uiPath: missing })).toBeInstanceOf(Error)
  })
})

describe('GET /api/flows/:id/ui.js', () => {
  it('serves the bundle as JavaScript', { timeout: BUILD_TIMEOUT }, async () => {
    clearExtensionBundleCache()
    const flow = await temporaryFlow()
    const server = await serveFlowRegistry({
      registry: registryOf([flow]),
      host: '127.0.0.1',
      port: 0,
      routes: jobikAllRoutes,
    })
    pushCleanup(() => server.close())

    const response = await fetch(`${server.url}/api/flows/${flow.id}/ui.js`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/javascript')
    expect(await response.text()).toContain('RenderedImage')
  })

  it('answers a broken extension with a constant 500', { timeout: BUILD_TIMEOUT }, async () => {
    clearExtensionBundleCache()
    const flow = await temporaryFlow()
    const broken = { ...flow, uiPath: path.resolve(publicationFixture.root, 'no-such-flow-ui.tsx') }
    const server = await serveFlowRegistry({
      registry: registryOf([broken]),
      host: '127.0.0.1',
      port: 0,
      routes: jobikAllRoutes,
    })
    pushCleanup(() => server.close())

    const response = await fetch(`${server.url}/api/flows/${broken.id}/ui.js`)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: { _tag: null, message: WIRE_MESSAGES.internal },
    })
  })
})
