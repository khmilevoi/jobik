import { describe, expect, it } from 'vitest'
import {
  publicationFixture,
  publicationSampleInput,
} from '../../../../examples/publication/fixtures.js'
import { type JobikServer, serveFlowRegistry } from './httpServer.js'
import { jobikAllRoutes } from './runRoutes.js'
import { collectNdjson, readNdjson, registryOf } from './runTestSupport.js'
import { pushCleanup, setupCleanups, temporaryFlow } from './testSupport.js'
import { WIRE_MESSAGES } from './wireError.js'

setupCleanups()

/** Run the publication flow once and return the descriptor its `render` node produced. */
async function renderedAsset(): Promise<{
  server: JobikServer
  descriptor: { mime: string; bytes: number; id: string }
}> {
  const flow = await temporaryFlow()
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
    body: JSON.stringify({ startId: publicationFixture.startId, input: publicationSampleInput }),
  })
  const events = await collectNdjson(readNdjson(response))
  const settled = events.at(-1)
  if (settled?.type !== 'run-settled') throw new Error('the run did not settle')
  const render = settled.report.nodes.find((node) => node.nodeId === 'render')
  const descriptor = render?.assets.image
  if (descriptor === undefined) throw new Error('the render node produced no image asset')
  return { server, descriptor }
}

describe('GET /api/assets/:assetId', () => {
  it('serves the bytes under the descriptor id with the declared mime', async () => {
    const { server, descriptor } = await renderedAsset()
    const response = await fetch(`${server.url}/api/assets/${descriptor.id}`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(descriptor.mime)
    expect(response.headers.get('content-length')).toBe(String(descriptor.bytes))
    // The mime is author-declared (`jobik.asset({ mime })`); nosniff keeps the browser from
    // executing an `image/svg+xml` asset as script on the Studio's own origin.
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')

    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(bytes.byteLength).toBe(descriptor.bytes)
    // A PNG signature: the run really produced the image the descriptor describes.
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it('404s an unknown asset id with an untagged body', async () => {
    const { server } = await renderedAsset()
    const response = await fetch(`${server.url}/api/assets/not-an-asset`)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: { _tag: null, message: WIRE_MESSAGES.notFound },
    })
  })
})
