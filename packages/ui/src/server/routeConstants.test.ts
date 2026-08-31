import { describe, expect, it } from 'vitest'
import { serveFlowRegistry } from './httpServer.js'
import type { JobikRoute } from './routes.js'
import { jobikAllRoutes } from './runRoutes.js'
import { registryOf } from './runTestSupport.js'
import { pushCleanup, setupCleanups, temporaryFlow } from './testSupport.js'
import { WIRE_MESSAGES } from './wireError.js'
import { findUnsafeValues } from './wireSafety.js'

setupCleanups()

/**
 * The two router-level answers the wire audit cleared but nothing pinned: the 405 a known path
 * with the wrong method gets, and the 500 a handler that throws gets.
 *
 * Both are constants from the closed `WIRE_MESSAGES` set and neither can vary today — which is the
 * whole reason to pin them. The 500 in particular is the one place a *thrown* value reaches the
 * router, and its safety rests entirely on the router never inspecting it.
 */

async function serve(routes: readonly JobikRoute[] = jobikAllRoutes) {
  const flow = await temporaryFlow()
  const server = await serveFlowRegistry({
    registry: registryOf([flow]),
    host: '127.0.0.1',
    port: 0,
    routes,
  })
  pushCleanup(() => server.close())
  return { server, flow }
}

describe('a known path with the wrong method', () => {
  it('answers 405 with the untagged constant', async () => {
    const { server } = await serve()
    const response = await fetch(`${server.url}/api/flows`, { method: 'POST' })
    expect(response.status).toBe(405)
    const body = await response.json()
    expect(body).toEqual({ error: { _tag: null, message: WIRE_MESSAGES.methodNotAllowed } })
    expect(findUnsafeValues(body)).toEqual([])
  })

  it('answers 405 on every route pattern, not just the collection', async () => {
    const { server, flow } = await serve()
    for (const target of [
      { method: 'DELETE', path: `/api/flows/${flow.id}` },
      { method: 'GET', path: `/api/flows/${flow.id}/run` },
      { method: 'GET', path: `/api/flows/${flow.id}/validate` },
      { method: 'PUT', path: `/api/flows/${flow.id}/ui.js` },
      { method: 'GET', path: '/api/runs/some-token/cancel' },
    ]) {
      const response = await fetch(`${server.url}${target.path}`, { method: target.method })
      expect([target.path, response.status]).toEqual([target.path, 405])
      expect(await response.json()).toEqual({
        error: { _tag: null, message: WIRE_MESSAGES.methodNotAllowed },
      })
    }
  })

  it('answers 404, not 405, for a path no route declares', async () => {
    const { server } = await serve()
    const response = await fetch(`${server.url}/api/nope`, { method: 'POST' })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: { _tag: null, message: WIRE_MESSAGES.notFound },
    })
  })
})

describe('a handler that throws', () => {
  /** Everything a thrown value could disclose, wrapped in the shapes a leak would take. */
  const SECRETS = {
    path: 'C:/Users/someone/secrets/flow.ui.tsx',
    message: 'connect ECONNREFUSED 10.1.2.3:5432 as user hunter2',
  }

  const throwing: readonly JobikRoute[] = [
    ...jobikAllRoutes,
    {
      method: 'GET',
      pattern: '/api/flows/throwing/boom',
      handle: async () => {
        const error = new Error(`${SECRETS.message} while reading ${SECRETS.path}`)
        Object.assign(error, { path: SECRETS.path })
        throw error
      },
    },
  ]

  it('answers 500 with the untagged constant and nothing of the thrown value', async () => {
    const { server } = await serve(throwing)
    const response = await fetch(`${server.url}/api/flows/throwing/boom`)
    expect(response.status).toBe(500)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({ error: { _tag: null, message: WIRE_MESSAGES.internal } })
    // The router never inspects the thrown value. Swept over the raw text, so a leak through a
    // header-shaped or truncated body would be caught too.
    expect(findUnsafeValues(text, [SECRETS.path, SECRETS.message, 'hunter2'])).toEqual([])
  })

  it('answers the same constant for a thrown non-Error', async () => {
    // `catch(() => …)` takes no argument, so the shape of what was thrown cannot matter. Pinned
    // because a future handler-error path that *did* inspect it would fail here first.
    const { server } = await serve([
      ...jobikAllRoutes,
      {
        method: 'GET',
        pattern: '/api/flows/throwing/string',
        handle: async () => {
          throw SECRETS.path
        },
      },
    ])
    const response = await fetch(`${server.url}/api/flows/throwing/string`)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: { _tag: null, message: WIRE_MESSAGES.internal },
    })
  })
})
