import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import * as jobik from '@jobik/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { serveFlowRegistry } from './httpServer.js'
import {
  createRunArchive,
  importRunArchive,
  listPersistedRuns,
  readPersistedAsset,
  readPersistedRun,
} from './runHistory.js'
import { jobikAllRoutes } from './runRoutes.js'
import { collectNdjson, createProbeFlow, readNdjson, registryOf } from './runTestSupport.js'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function fixture() {
  const probe = await createProbeFlow('logging')
  cleanups.push(probe.cleanup)
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jobik-history-'))
  cleanups.push(() => fs.rm(directory, { recursive: true, force: true }))
  const flow = { ...probe.flow, runHistory: { directory } }
  return { flow, directory }
}

describe('file-backed run history', () => {
  it('imports original reports with their timings and marks absent inputs as unavailable', async () => {
    const { flow } = await fixture()
    const imported = await importRunArchive({
      flow,
      report: {
        flowName: flow.id,
        startId: 'start1',
        runNumber: 12,
        status: 'failed',
        elapsedMs: 565802,
        nodes: [],
        logs: [],
        error: null,
      },
    })
    if (imported instanceof Error) throw imported
    expect(await readPersistedRun({ flow, runId: imported.runId })).toMatchObject({
      source: 'studio-export',
      input: null,
      document: null,
      revision: null,
      status: 'failed',
      report: { runNumber: 12, elapsedMs: 565802 },
    })
  })

  it('keeps a successful execution successful when media export fails, and retains the warning', async () => {
    const { flow } = await fixture()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const server = await serveFlowRegistry({
      registry: registryOf([
        {
          ...flow,
          runHistory: {
            ...flow.runHistory,
            onNodeSettled: async () => new Error('media export unavailable'),
          },
        },
      ]),
      host: '127.0.0.1',
      port: 0,
      routes: jobikAllRoutes,
    })
    cleanups.push(() => server.close())
    const response = await fetch(`${server.url}/api/flows/${flow.id}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ startId: 'start1', input: { text: 'once' } }),
    })
    const events = await collectNdjson(readNdjson(response))
    const terminal = events.at(-1)
    expect(terminal).toMatchObject({
      type: 'run-settled',
      report: { status: 'ok', storageError: { _tag: 'RunPersistenceError' } },
    })
    if (terminal?.type === 'run-settled') {
      const record = await readPersistedRun({ flow, runId: terminal.report.runId ?? '' })
      expect(record).toMatchObject({
        status: 'ok',
        report: { status: 'ok', storageError: { _tag: 'RunPersistenceError' } },
        storageError: { _tag: 'RunPersistenceError' },
      })
    }
    warn.mockRestore()
  })

  it('persists a rejected start before publishing the terminal failure', async () => {
    const { flow } = await fixture()
    const server = await serveFlowRegistry({
      registry: registryOf([flow]),
      host: '127.0.0.1',
      port: 0,
      routes: jobikAllRoutes,
    })
    cleanups.push(() => server.close())
    const response = await fetch(`${server.url}/api/flows/${flow.id}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ startId: 'missing', input: { text: 'rejected' } }),
    })
    const events = await collectNdjson(readNdjson(response))
    expect(events.at(-1)).toMatchObject({
      type: 'run-failed',
      error: { _tag: 'StartNotFoundError' },
    })
    const runs = await listPersistedRuns(flow)
    if (runs instanceof Error) throw runs
    expect(runs).toHaveLength(1)
    expect(await readPersistedRun({ flow, runId: runs[0]?.runId ?? '' })).toMatchObject({
      status: 'failed',
      report: null,
      failure: { _tag: 'StartNotFoundError' },
      input: { text: 'rejected' },
    })
  })

  it('persists submitted inputs, executed document and outputs and reads them from a new server', async () => {
    const { flow, directory } = await fixture()
    const first = await serveFlowRegistry({
      registry: registryOf([flow]),
      host: '127.0.0.1',
      port: 0,
      routes: jobikAllRoutes,
    })
    const response = await fetch(`${first.url}/api/flows/${flow.id}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ startId: 'start1', input: { text: 'retained message' } }),
    })
    const events = await collectNdjson(readNdjson(response))
    await first.close()
    const terminal = events.at(-1)
    expect(terminal?.type).toBe('run-settled')
    if (terminal?.type !== 'run-settled') return
    expect(terminal.report.runId).toMatch(/^[a-f0-9-]{36}$/)
    const second = await serveFlowRegistry({
      registry: registryOf([flow]),
      host: '127.0.0.1',
      port: 0,
      routes: jobikAllRoutes,
    })
    cleanups.push(() => second.close())
    const list = await (await fetch(`${second.url}/api/flows/${flow.id}/runs`)).json()
    expect(list.runs).toHaveLength(1)
    const retained = await (
      await fetch(`${second.url}/api/flows/${flow.id}/runs/${list.runs[0].runId}`)
    ).json()
    expect(retained.input).toEqual({ text: 'retained message' })
    expect(retained.revision).toMatch(/^[a-f0-9]{64}$/)
    expect(retained.document.connections).toHaveLength(1)
    expect(
      retained.report.nodes.find((node: jobik.NodeReport) => node.nodeId === 'probe'),
    ).toMatchObject({
      input: { text: 'retained message' },
      output: { ok: true },
    })
    expect(await fs.readdir(path.join(directory, 'records'))).toHaveLength(1)
  })

  it('retains partial outputs after interruption, isolates corrupt files and rejects traversal', async () => {
    const { flow, directory } = await fixture()
    const archive = await createRunArchive({
      flow,
      startId: 'start1',
      input: { text: 'partial' },
      document: null,
      revision: null,
    })
    expect(archive).not.toBeInstanceOf(Error)
    if (archive instanceof Error) return
    archive.enqueue({
      type: 'run-started',
      flowName: flow.id,
      startId: 'start1',
      runNumber: 1,
      nodeCount: 2,
    })
    archive.enqueue({
      type: 'node-settled',
      runNumber: 1,
      node: {
        nodeId: 'start1',
        status: 'ok',
        elapsedMs: 0,
        output: { text: 'partial' },
        assets: {},
        error: null,
      },
    })
    expect(await archive.flush()).toBeUndefined()
    archive.close()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await fs.writeFile(
      path.join(directory, 'records', '00000000-0000-4000-8000-000000000000.json'),
      '{',
    )
    const runs = await listPersistedRuns(flow)
    expect(runs).not.toBeInstanceOf(Error)
    expect(runs).toHaveLength(1)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
    const record = await readPersistedRun({ flow, runId: archive.runId })
    expect(record).toMatchObject({
      status: 'interrupted',
      events: expect.arrayContaining([expect.objectContaining({ type: 'node-settled' })]),
    })
    expect(await readPersistedRun({ flow, runId: '../outside' })).toBeNull()
  })

  it('stores actual binary asset bytes and reports hook/write failure', async () => {
    const { flow } = await fixture()
    const descriptor = jobik.registerAsset({ data: Buffer.from('file bytes'), mime: 'image/png' })
    const archive = await createRunArchive({
      flow,
      startId: 'start1',
      input: {},
      document: null,
      revision: null,
    })
    if (archive instanceof Error) throw archive
    archive.enqueue({
      type: 'node-settled',
      runNumber: 1,
      node: {
        nodeId: 'image',
        status: 'ok',
        elapsedMs: 1,
        output: { image: descriptor },
        assets: { image: descriptor },
        error: null,
      },
    })
    expect(await archive.flush()).toBeUndefined()
    archive.close()
    const asset = await readPersistedAsset({ flow, assetId: descriptor.id })
    expect(asset).not.toBeInstanceOf(Error)
    expect(asset).not.toBeNull()
    if (asset instanceof Error || asset === null) return
    expect(Buffer.from(asset.data).toString()).toBe('file bytes')
    const broken = await createRunArchive({
      flow: {
        ...flow,
        runHistory: { ...flow.runHistory, onNodeSettled: async () => new Error('hook failed') },
      },
      startId: 'start1',
      input: {},
      document: null,
      revision: null,
    })
    if (broken instanceof Error) throw broken
    broken.enqueue({
      type: 'node-settled',
      runNumber: 2,
      node: { nodeId: 'image', status: 'ok', elapsedMs: 1, output: {}, assets: {}, error: null },
    })
    expect(await broken.flush()).toBeInstanceOf(Error)
    broken.close()
  })
})
