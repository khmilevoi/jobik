import { describe, expect, it, vi } from 'vitest'
import { serveFlowRegistry } from './httpServer.js'
import { jobikAllRoutes } from './runRoutes.js'
import { registryOf } from './runTestSupport.js'
import { pushCleanup, setupCleanups, temporaryFlow } from './testSupport.js'
import { WIRE_MESSAGES } from './wireError.js'
import { findUnsafeValues } from './wireSafety.js'

setupCleanups()

/**
 * The validate route's error projection.
 *
 * The closeout wire audit flagged this as the one call to a wire projection made without the
 * `isJobikError` gate every other path uses: it rested on `DraftValidation.error` being typed
 * `jobik.JobikError`, a type-level guarantee only. The failure mode was never a leak — the
 * exhaustive switch falls off the end and returns `undefined`, which `JSON.stringify` drops — but
 * it was a silently fieldless body, and nothing pinned either half.
 *
 * The mock is the only way to reach the untyped branch: nothing in the real `validateDraft` can
 * produce it, which is exactly why the guarantee was type-level.
 */

const control = vi.hoisted(() => ({ error: undefined as unknown }))

vi.mock('./flowService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./flowService.js')>()
  return {
    ...actual,
    validateDraft: (args: Parameters<typeof actual.validateDraft>[0]) =>
      control.error === undefined
        ? actual.validateDraft(args)
        : { valid: false, error: control.error },
  }
})

async function postDraft(draft: unknown) {
  const flow = await temporaryFlow()
  const server = await serveFlowRegistry({
    registry: registryOf([flow]),
    host: '127.0.0.1',
    port: 0,
    routes: jobikAllRoutes,
  })
  pushCleanup(() => server.close())
  const response = await fetch(`${server.url}/api/flows/${flow.id}/validate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ document: draft }),
  })
  return { response, body: (await response.json()) as Record<string, unknown> }
}

describe('POST /api/flows/:id/validate', () => {
  it('projects a tagged validation failure with its fields', async () => {
    control.error = undefined
    const { response, body } = await postDraft({ format: 'not.jobik.flow', version: 1 })
    expect(response.status).toBe(200)
    expect(body.valid).toBe(false)
    expect((body.error as { _tag: unknown })._tag).toEqual(expect.any(String))
    expect(findUnsafeValues(body)).toEqual([])
  })

  it('answers an untagged error with the constant body, never a fieldless one', async () => {
    control.error = new Error('ENOENT: no such file C:\\Users\\someone\\secret\\draft.json')
    try {
      const { response, body } = await postDraft({})
      expect(response.status).toBe(200)
      expect(body).toEqual({
        valid: false,
        error: { _tag: null, message: WIRE_MESSAGES.internal },
      })
      // The point of the gate: `error` is present and carries a message. The ungated projection
      // returned `undefined` here, and `JSON.stringify` dropped the key entirely.
      expect(body.error).toBeDefined()
      expect(JSON.stringify(body)).not.toContain('secret')
      expect(findUnsafeValues(body)).toEqual([])
    } finally {
      control.error = undefined
    }
  })
})
