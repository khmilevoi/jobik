import * as http from 'node:http'
import type { JobikConfig } from './config.js'
import { discoverFlows, type FlowRegistry } from './discovery.js'
import { createJobikRequestListener, type JobikRoute } from './routes.js'

/**
 * The Studio's Node server.
 *
 * Jobik v1 provides no authentication and no token management; networking and access control are
 * the application's responsibility, which is why the default host is loopback.
 */

export type JobikServer = {
  /** The origin the server is actually listening on, e.g. `http://127.0.0.1:4318`. */
  readonly url: string
  readonly registry: FlowRegistry
  close(): Promise<void>
}

/** An IPv6 literal needs brackets in a URL; `server.address()` returns it bare. */
function originOf(host: string, port: number): string {
  const authority = host.includes(':') ? `[${host}]` : host
  return `http://${authority}:${port}`
}

/**
 * Listen on an already-built registry.
 *
 * Split out from `startJobikServer` because a caller that already has a `FlowRegistry` — a test
 * bound to a throwaway document, or P14's end-to-end Studio test — should not have to write a
 * binding module on disk just to reach the HTTP surface.
 *
 * `port: 0` asks the OS for an ephemeral port; `url` always reports the port actually bound.
 */
export async function serveFlowRegistry(args: {
  registry: FlowRegistry
  host: string
  port: number
  routes?: readonly JobikRoute[]
}): Promise<JobikServer> {
  const server = http.createServer(
    createJobikRequestListener({ registry: args.registry, routes: args.routes }),
  )

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(args.port, args.host, () => {
      server.removeListener('error', reject)
      resolve()
    })
  })

  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : args.port

  return {
    url: originOf(args.host, port),
    registry: args.registry,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections()
        server.close((error) => (error === undefined ? resolve() : reject(error)))
      }),
  }
}

/** Discover the configured flows, then listen on the configured host and port. */
export async function startJobikServer(args: {
  config: JobikConfig
  routes?: readonly JobikRoute[]
}): Promise<JobikServer> {
  const registry = await discoverFlows({ config: args.config })
  return serveFlowRegistry({
    registry,
    host: args.config.server.host,
    port: args.config.server.port,
    routes: args.routes,
  })
}
