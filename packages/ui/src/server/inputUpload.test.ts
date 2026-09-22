import { describe, expect, it } from 'vitest'
import { defineJobikConfig } from './config.js'
import { describeFlow } from './descriptor.js'
import { serveFlowRegistry } from './httpServer.js'
import { jobikAllRoutes } from './runRoutes.js'
import { registryOf } from './runTestSupport.js'
import { committedFlow, pushCleanup, setupCleanups, temporaryFlow } from './testSupport.js'

setupCleanups()
const policy = {
  accept: 'image/png,image/jpeg',
  maxBytes: 100,
  upload: async ({ file }: { file: { bytes: Uint8Array } }) => ({
    value: { length: file.bytes.length },
  }),
}

describe('input uploads', () => {
  it('preserves configured handlers and only publishes safe hints', async () => {
    const flow = await committedFlow()
    const config = defineJobikConfig({
      flows: [
        { binding: flow.bindingPath, ui: flow.uiPath, inputUploads: { start1: { title: policy } } },
      ],
    })
    expect(config.flows[0].inputUploads?.start1.title.upload).toBe(policy.upload)
    const descriptor = describeFlow({ ...flow, inputUploads: config.flows[0].inputUploads })
    expect(descriptor).not.toBeInstanceOf(Error)
    if (descriptor instanceof Error) return
    expect(descriptor.nodes[0].inputUploads).toEqual({
      title: { accept: policy.accept, maxBytes: 100 },
    })
    expect(JSON.stringify(descriptor)).not.toContain('upload"')
  })
  it('uploads bytes through a configured start field without starting a run', async () => {
    const flow = { ...(await temporaryFlow()), inputUploads: { start1: { title: policy } } }
    const server = await serveFlowRegistry({
      registry: registryOf([flow]),
      host: '127.0.0.1',
      port: 0,
      routes: jobikAllRoutes,
    })
    pushCleanup(() => server.close())
    const response = await fetch(`${server.url}/api/flows/${flow.id}/inputs/start1/title/upload`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'photo.png',
        contentType: 'image/png',
        dataBase64: Buffer.from('bytes').toString('base64'),
      }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ value: { length: 5 } })
  })
})

import { createJobikClient } from '../client/JobikClient.js'
import type { JobikInputUpload } from './inputUploadConfig.js'

async function uploadServer(upload: JobikInputUpload = policy) {
  const flow = {
    ...(await temporaryFlow()),
    inputUploads: { start1: { title: upload }, render: { title: upload } },
  }
  const server = await serveFlowRegistry({
    registry: registryOf([flow]),
    host: '127.0.0.1',
    port: 0,
    routes: jobikAllRoutes,
  })
  pushCleanup(() => server.close())
  return { server, flow }
}
const file = {
  name: 'photo.png',
  contentType: 'image/png',
  dataBase64: Buffer.from('bytes').toString('base64'),
}

it.each([
  ['invalid base64', { ...file, dataBase64: '!!!!' }, 400],
  ['noncanonical base64', { ...file, dataBase64: 'YR==' }, 400],
  ['empty bytes', { ...file, dataBase64: '' }, 400],
  ['wrong type', { ...file, contentType: 'text/plain' }, 415],
  ['oversize', { ...file, dataBase64: Buffer.alloc(101).toString('base64') }, 413],
] as const)('refuses %s before storage', async (_label, body, status) => {
  const { server, flow } = await uploadServer({
    ...policy,
    upload: async () => {
      throw new Error('must not invoke handler')
    },
  })
  const response = await fetch(`${server.url}/api/flows/${flow.id}/inputs/start1/title/upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  expect(response.status).toBe(status)
})
it.each(['render/title', 'start1/constructor', 'constructor/title', 'start1/missing'])(
  'refuses undeclared target %s',
  async (target) => {
    const { server, flow } = await uploadServer()
    const response = await fetch(`${server.url}/api/flows/${flow.id}/inputs/${target}/upload`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(file),
    })
    expect(response.status).toBe(404)
  },
)
it('retains the JSON-only cross-origin request gate', async () => {
  const { server, flow } = await uploadServer()
  const response = await fetch(`${server.url}/api/flows/${flow.id}/inputs/start1/title/upload`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify(file),
  })
  expect(response.status).toBe(415)
})
it('never exposes a storage error or arbitrary adapter fields', async () => {
  const secret = 'private/path/credential'
  const { server, flow } = await uploadServer({ ...policy, upload: async () => new Error(secret) })
  const client = createJobikClient({ baseUrl: server.url })
  const failure = await client.uploadInput({
    flowId: flow.id,
    nodeId: 'start1',
    field: 'title',
    file,
  })
  expect(failure).toBeInstanceOf(Error)
  expect(JSON.stringify(failure)).not.toContain(secret)
  const second = await uploadServer({
    ...policy,
    upload: async () => ({ value: 'stored', secret }),
  })
  const result = await createJobikClient({ baseUrl: second.server.url }).uploadInput({
    flowId: second.flow.id,
    nodeId: 'start1',
    field: 'title',
    file,
  })
  expect(result).toEqual({ value: 'stored' })
})
it.each([0, -1, 1.5, Infinity, 64 * 1024 * 1024 + 1])(
  'rejects invalid configured byte limit %s',
  async (maxBytes) => {
    const flow = await committedFlow()
    expect(() =>
      defineJobikConfig({
        flows: [
          {
            binding: flow.bindingPath,
            ui: flow.uiPath,
            inputUploads: { start1: { title: { ...policy, maxBytes } } },
          },
        ],
      }),
    ).toThrow(TypeError)
  },
)

import * as http from 'node:http'

it('returns 413 for an oversized chunked body without resetting the connection', async () => {
  const { server, flow } = await uploadServer()
  const status = await new Promise<number>((resolve, reject) => {
    const request = http.request(
      `${server.url}/api/flows/${flow.id}/inputs/start1/title/upload`,
      { method: 'POST', headers: { 'content-type': 'application/json' } },
      (response) => {
        response.resume()
        resolve(response.statusCode ?? 0)
      },
    )
    request.on('error', reject)
    request.write('x'.repeat(9000))
    request.end()
  })
  expect(status).toBe(413)
})
it('propagates response disconnect to an active storage adapter', async () => {
  const started = deferred<void>()
  const aborted = deferred<boolean>()
  const { server, flow } = await uploadServer({
    ...policy,
    upload: async ({ signal }) => {
      signal.addEventListener('abort', () => aborted.resolve(true), { once: true })
      started.resolve()
      await aborted.promise
      return new Error('cancelled')
    },
  })
  const controller = new AbortController()
  const response = fetch(`${server.url}/api/flows/${flow.id}/inputs/start1/title/upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(file),
    signal: controller.signal,
  }).catch(() => null)
  await started.promise
  controller.abort()
  expect(await aborted.promise).toBe(true)
  await response
})
it.each([
  ['function', () => 'no'],
  ['undefined', undefined],
  ['symbol', Symbol('no')],
  ['bigint', 1n],
  ['nonfinite', NaN],
  ['date', new Date()],
  ['binary', Buffer.from('no')],
  ['nested undefined', { nested: undefined }],
  ['nested function', { nested: () => 'no' }],
  ['sparse array', new Array(1)],
])('rejects non-JSON adapter result %s', async (_label, value) => {
  const { server, flow } = await uploadServer({ ...policy, upload: async () => ({ value }) })
  const response = await fetch(`${server.url}/api/flows/${flow.id}/inputs/start1/title/upload`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(file),
  })
  expect(response.status).toBe(500)
})
it('rejects cyclic adapter values', async () => {
  const value: Record<string, unknown> = {}
  value.self = value
  const { server, flow } = await uploadServer({ ...policy, upload: async () => ({ value }) })
  const result = await createJobikClient({ baseUrl: server.url }).uploadInput({
    flowId: flow.id,
    nodeId: 'start1',
    field: 'title',
    file,
  })
  expect(result).toBeInstanceOf(Error)
})
it('returns an unchanged JSON snapshot for nested plain adapter values', async () => {
  const value = { image: 'stored', dimensions: [1, 2], available: true, extra: null }
  const { server, flow } = await uploadServer({ ...policy, upload: async () => ({ value }) })
  const result = await createJobikClient({ baseUrl: server.url }).uploadInput({
    flowId: flow.id,
    nodeId: 'start1',
    field: 'title',
    file,
  })
  expect(result).toEqual({ value })
})

function deferred<T>() {
  const state = { resolve: (_value: T): void => {} }
  const promise = new Promise<T>((resolve) => {
    state.resolve = resolve
  })
  return { promise, resolve: state.resolve }
}

it('serves configured stored-value previews without uploading or leaking adapter errors', async () => {
  const image = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])
  const configured = {
    ...policy,
    preview: async ({ value }: { value: unknown }) =>
      value === 'bad'
        ? new Error('secret-storage-detail')
        : { bytes: image, contentType: 'image/png' },
  }
  const { server, flow } = await uploadServer(configured)
  const url = `${server.url}/api/flows/${flow.id}/inputs/start1/title/preview?value=`
  const response = await fetch(`${url}${encodeURIComponent(JSON.stringify('stored'))}`)
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('image/png')
  expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(image)
  const failed = await fetch(`${url}%22bad%22`)
  expect(failed.status).toBe(422)
  expect(await failed.text()).not.toContain('secret-storage-detail')
  for (const value of ['', '%7B', '%22x%22&value=%22y%22', 'x'.repeat(5000)]) {
    expect((await fetch(`${url}${value}`)).status).toBe(400)
  }
  for (const target of ['render/title', 'start1/missing', 'constructor/title']) {
    expect(
      (await fetch(`${server.url}/api/flows/${flow.id}/inputs/${target}/preview?value=null`))
        .status,
    ).toBe(404)
  }
})

it('does not serve previews without a handler or with active image media', async () => {
  const absent = await uploadServer()
  expect(
    (
      await fetch(
        `${absent.server.url}/api/flows/${absent.flow.id}/inputs/start1/title/preview?value=null`,
      )
    ).status,
  ).toBe(404)
  const unsafe = await uploadServer({
    ...policy,
    preview: async () => ({
      bytes: new TextEncoder().encode('<svg/>'),
      contentType: 'image/svg+xml',
    }),
  })
  expect(
    (
      await fetch(
        `${unsafe.server.url}/api/flows/${unsafe.flow.id}/inputs/start1/title/preview?value=null`,
      )
    ).status,
  ).toBe(500)
})

it('publishes only a preview capability and preserves the configured handler', async () => {
  const preview = async () => ({ bytes: Uint8Array.from([1]), contentType: 'image/png' })
  const flow = await committedFlow()
  const config = defineJobikConfig({
    flows: [
      {
        binding: flow.bindingPath,
        ui: flow.uiPath,
        inputUploads: { start1: { title: { ...policy, preview } } },
      },
    ],
  })
  expect(config.flows[0].inputUploads?.start1.title.preview).toBe(preview)
  const descriptor = describeFlow({ ...flow, inputUploads: config.flows[0].inputUploads })
  if (descriptor instanceof Error) throw descriptor
  expect(descriptor.nodes[0].inputUploads?.title.preview).toBe(true)
})

it('cancels a stored preview adapter on response disconnect', async () => {
  const started = deferred<void>()
  const aborted = deferred<boolean>()
  const { server, flow } = await uploadServer({
    ...policy,
    preview: async ({ signal }) => {
      signal.addEventListener('abort', () => aborted.resolve(true), { once: true })
      started.resolve()
      await aborted.promise
      return new Error('cancelled')
    },
  })
  const controller = new AbortController()
  const pending = fetch(
    `${server.url}/api/flows/${flow.id}/inputs/start1/title/preview?value=null`,
    { signal: controller.signal },
  ).catch(() => null)
  await started.promise
  controller.abort()
  expect(await aborted.promise).toBe(true)
  await pending
})
