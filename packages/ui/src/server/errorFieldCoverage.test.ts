import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'
import * as jobik from '@jobik/core'
import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import { publicationFixture } from '../../../../examples/showcase/publication/fixtures.js'
import type { DiscoveredFlow } from './discovery.js'
import { loadFlow, saveFlow } from './flowService.js'
import { type JobikServer, serveFlowRegistry } from './httpServer.js'
import { jobikAllRoutes } from './runRoutes.js'
import { collectNdjson, readNdjson, registryOf } from './runTestSupport.js'
import { MAX_WIRE_FRAMES } from './stackFrames.js'
import { pushCleanup, setupCleanups, temporaryFlow } from './testSupport.js'

/**
 * Closes three field-level gaps recorded in the errors audit
 * (`.superpowers/waves/2026-08-29-jobik-v1/closeout/03-errors-audit-report.md`, "Left, and why"):
 * `FlowSaveError` never crossed a real save route in a test, `FlowRevisionConflictError.actualRevision`
 * was asserted only on a constructed error, and `NodeExecutionError.hiddenFrames` had no real-path
 * assertion above zero. The production code already populates all three; every test below drives it
 * through a real code path rather than a hand-built error, as `wireError.test.ts` and the audit's
 * cited tests already do for everything else.
 */

setupCleanups()

/** A server on an ephemeral port, over a throwaway copy of the example document — same shape as
 *  `httpServer.test.ts`'s own helper, duplicated here because that file is not this plan's to edit. */
async function startOverCopy(): Promise<{ server: JobikServer; documentPath: string }> {
  const discovered = await temporaryFlow()
  const server = await serveFlowRegistry({
    registry: registryOf([discovered]),
    host: '127.0.0.1',
    port: 0,
  })
  pushCleanup(() => server.close())
  return { server, documentPath: discovered.documentPath }
}

// ---------------------------------------------------------------------------
// Gap 1 — FlowSaveError over a real write failure
// ---------------------------------------------------------------------------

describe('FlowSaveError over a real write failure', () => {
  it('saveFlow() returns it when the destination file is read-only, so the atomic rename cannot replace it', async () => {
    const flow = await temporaryFlow()
    const loaded = await loadFlow(flow)
    if (loaded instanceof Error) throw loaded

    // Real Windows fs condition, not a mock or an injected failure: `writeFileAtomic` opens a fresh
    // temporary file beside the target — which succeeds even though the target is read-only — and
    // then RENAMES it over the target. Windows refuses to replace a read-only file, so the rename
    // itself fails with EPERM. Checked empirically before writing this assertion: renaming a new
    // file over a `chmod(0o444)` target on this machine raises exactly that.
    await fs.chmod(flow.documentPath, 0o444)
    try {
      const saved = await saveFlow({
        flow,
        draft: loaded.document,
        expectedRevision: loaded.revision,
      })
      expect(saved).toBeInstanceOf(jobik.FlowSaveError)
      if (!(saved instanceof jobik.FlowSaveError)) throw new Error('unreachable')
      expect(saved._tag).toBe('FlowSaveError')
      expect(saved.path).toBe(flow.documentPath)
      expect(saved.cause).toBeDefined()
    } finally {
      // Restore before the shared afterEach tries to remove the temp directory.
      await fs.chmod(flow.documentPath, 0o666)
    }
  })

  it('POST /api/flows/:id/save maps the same real failure to 500 and the generic wire body', async () => {
    const { server, documentPath } = await startOverCopy()
    const loaded = (await (
      await fetch(`${server.url}/api/flows/${publicationFixture.flowName}`)
    ).json()) as { document: unknown; revision: string }

    await fs.chmod(documentPath, 0o444)
    try {
      const response = await fetch(`${server.url}/api/flows/${publicationFixture.flowName}/save`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ document: loaded.document, expectedRevision: loaded.revision }),
      })
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({
        error: { _tag: 'FlowSaveError', message: 'Cannot save the flow document' },
      })
    } finally {
      await fs.chmod(documentPath, 0o666)
    }
  })
})

// ---------------------------------------------------------------------------
// Gap 2 — FlowRevisionConflictError.actualRevision on a real conflict
// ---------------------------------------------------------------------------

describe('FlowRevisionConflictError.actualRevision on a real conflict', () => {
  it("saveFlow() returns the document's true current revision, not merely a defined string", async () => {
    const flow = await temporaryFlow()
    const loaded = await loadFlow(flow)
    if (loaded instanceof Error) throw loaded

    // Drift the file under the draft, the same way flowService.test.ts's own conflict test does.
    await fs.appendFile(flow.documentPath, '\n', 'utf8')
    const trueRevision = jobik.revisionOf(await fs.readFile(flow.documentPath))
    expect(trueRevision).not.toBe(loaded.revision)

    const saved = await saveFlow({
      flow,
      draft: loaded.document,
      expectedRevision: loaded.revision,
    })
    expect(saved).toBeInstanceOf(jobik.FlowRevisionConflictError)
    if (!(saved instanceof jobik.FlowRevisionConflictError)) throw new Error('unreachable')
    expect(saved.actualRevision).toBe(trueRevision)
  })

  it('POST /api/flows/:id/save carries the same true revision on the wire', async () => {
    const { server, documentPath } = await startOverCopy()
    const loaded = (await (
      await fetch(`${server.url}/api/flows/${publicationFixture.flowName}`)
    ).json()) as { document: unknown; revision: string }

    await fs.appendFile(documentPath, '\n', 'utf8')
    const trueRevision = jobik.revisionOf(await fs.readFile(documentPath))

    const response = await fetch(`${server.url}/api/flows/${publicationFixture.flowName}/save`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ document: loaded.document, expectedRevision: loaded.revision }),
    })
    expect(response.status).toBe(409)
    const body = (await response.json()) as {
      error: { _tag: string; actualRevision: string }
    }
    expect(body.error._tag).toBe('FlowRevisionConflictError')
    expect(body.error.actualRevision).toBe(trueRevision)
  })
})

// ---------------------------------------------------------------------------
// Gap 3 — NodeExecutionError.hiddenFrames on a real, deep failure
// ---------------------------------------------------------------------------

/** Named, so the frame it produces has a function name worth asserting on. */
function recurseAndThrow(depth: number): never {
  if (depth <= 0) throw new Error('deep recursion probe failure')
  return recurseAndThrow(depth - 1)
}

const deepStart = jobik.start({
  title: 'Deep recursion probe start',
  input: z.object({ text: z.string() }),
})

const deepProbeNode = jobik.node({
  title: 'Deep recursion probe',
  input: z.object({ text: z.string() }),
  output: z.object({ ok: z.boolean() }),
  // MAX_WIRE_FRAMES is 4 and V8's default Error.stackTraceLimit is 10, so recursing well past both
  // leaves comfortably more in-flow frames than the wire can ever carry, whichever limit binds.
  run: () => recurseAndThrow(20),
})

/**
 * A discovered flow of our own, over a throwaway document. `bindingPath` deliberately points at
 * THIS file: the run route derives the flow root as `path.dirname(bindingPath)`, so the recursive
 * probe's frames — defined right here — resolve inside it and get relativised and counted for
 * real, the same trick `runTestSupport.ts`'s own probes use for their `bindingPath`.
 */
async function createDeepRecursionFlow(): Promise<{
  flow: DiscoveredFlow
  cleanup: () => Promise<void>
}> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jobik-deep-recursion-'))
  const documentPath = path.join(directory, 'flow.jobik.json')
  const document = {
    format: 'jobik.flow',
    version: 1,
    connections: [
      { from: { node: 'start1', field: 'text' }, to: { node: 'probe', field: 'text' } },
    ],
    literals: { probe: {} },
    layout: { start1: { x: 0, y: 0 }, probe: { x: 200, y: 0 } },
  }
  await fs.writeFile(documentPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
  const flow = jobik
    .flow('deep-recursion-probe')
    .start('start1', deepStart)
    .node('probe', deepProbeNode)
    .bind('path', documentPath)
  return {
    flow: {
      id: flow.name,
      flow,
      bindingPath: import.meta.filename,
      uiPath: import.meta.filename,
      documentPath,
    },
    cleanup: () => fs.rm(directory, { recursive: true, force: true }),
  }
}

describe('NodeExecutionError.hiddenFrames on a real run', () => {
  it('caps frames at MAX_WIRE_FRAMES and reports the overflow as hiddenFrames, greater than zero', async () => {
    const { flow, cleanup } = await createDeepRecursionFlow()
    pushCleanup(cleanup)
    const server = await serveFlowRegistry({
      registry: registryOf([flow]),
      host: '127.0.0.1',
      port: 0,
      routes: jobikAllRoutes,
    })
    pushCleanup(() => server.close())

    const response = await fetch(`${server.url}/api/flows/${flow.id}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ startId: 'start1', input: { text: 'hi' } }),
    })
    const events = await collectNdjson(readNdjson(response))
    const settled = events.at(-1)
    expect(settled?.type).toBe('run-settled')
    if (settled?.type !== 'run-settled') return
    expect(settled.report.status).toBe('failed')

    const failed = settled.report.nodes.find((node) => node.nodeId === 'probe')
    expect(failed?.error?._tag).toBe('NodeExecutionError')
    const error = failed?.error
    // Same narrowing `runRoutes.test.ts` uses: `'frames' in error` is what actually narrows the
    // wire error union down to the branch that carries `frames`/`hiddenFrames`.
    if (error === null || error === undefined || !('frames' in error)) return
    expect(error.frames).toHaveLength(MAX_WIRE_FRAMES)
    expect(error.hiddenFrames ?? 0).toBeGreaterThan(0)
  })
})
