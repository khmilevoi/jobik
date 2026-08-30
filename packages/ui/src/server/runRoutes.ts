import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import type * as jobik from '@jobik/core'
import {
  type JobikRoute,
  type JobikRouteContext,
  jobikFlowRoutes,
  readJsonBody,
  sendJson,
  sendWireError,
} from './routes.js'
import { cancelRun, registerRun, releaseRun } from './runRegistry.js'
import { type RunWireEvent, toRunStartWireError, toRunWireEvent } from './runWire.js'
import { untaggedWireErrorBody, WIRE_MESSAGES } from './wireError.js'

/**
 * The run half of the HTTP surface: start a run and stream it, cancel one in flight.
 *
 * `routes.ts` says its own table is not edited; it takes an array instead. So this module exports
 * its own routes and the concatenation a real server is started with. `startJobikServer`'s
 * `routes` still defaults to the four non-run routes — a caller that wants runs passes
 * `jobikAllRoutes` explicitly.
 *
 * The transport is newline-delimited JSON over a chunked `POST` response, not Server-Sent Events:
 * a run carries an input body, and `EventSource` cannot send one. One `RunWireEvent` per line, the
 * first always `run-accepted`.
 */

/**
 * `BoundFlow.run` narrows `startId` to the flow's own declared start ids. On the LOOSE
 * `jobik.BoundFlow` a `FlowRegistry` holds, that set computes to `never`, so the method cannot be
 * called with the `string` a request carries. This is the one place that widens it, and it widens
 * only the type: an unknown start id still comes back from `run()` itself as `StartNotFoundError`,
 * which the stream reports as `run-failed`.
 */
type LooseRun = (
  startId: string,
  input: unknown,
  options?: jobik.RunOptions,
) => Promise<jobik.RunReport | jobik.RunStartError>

function runStart(args: {
  flow: jobik.BoundFlow
  startId: string
  input: unknown
  options: jobik.RunOptions
}): Promise<jobik.RunReport | jobik.RunStartError> {
  const invoke = args.flow.run as unknown as LooseRun
  return invoke.call(args.flow, args.startId, args.input, args.options)
}

/** Resolve `:id`, answering 404 with the untagged constant when the registry does not know it. */
function flowOf(context: JobikRouteContext) {
  const discovered = context.registry.get(context.params.id ?? '')
  if (discovered === undefined) {
    sendWireError(context.response, 404, untaggedWireErrorBody(WIRE_MESSAGES.flowNotFound))
    return undefined
  }
  return discovered
}

/** A plain, non-null object body, so the `in` checks below are safe. */
function objectBodyOf(
  result: { readonly ok: true; readonly value: unknown } | { readonly ok: false },
): Record<string, unknown> | undefined {
  if (!result.ok) return undefined
  const value = result.value
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

/**
 * The chunked NDJSON writer.
 *
 * No `content-length`, so Node uses chunked transfer encoding and every `write` reaches the client
 * as it happens. `write` is a no-op once the stream is finished or the socket is gone, which is
 * what keeps a handler that outlives cancellation from throwing inside P9's synchronous `onEvent`.
 */
type EventStream = {
  write(event: RunWireEvent): void
  end(): void
  readonly finished: boolean
}

function openEventStream(response: ServerResponse): EventStream {
  response.writeHead(200, {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'cache-control': 'no-store',
  })
  let finished = false
  return {
    get finished() {
      return finished
    },
    write(event) {
      if (finished || response.writableEnded) return
      response.write(`${JSON.stringify(event)}\n`)
    },
    end() {
      if (finished) return
      finished = true
      response.end()
    },
  }
}

/** Read the run request body, or answer 400 and return `undefined`. */
async function runBodyOf(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<{ startId: string; input: unknown } | undefined> {
  const body = objectBodyOf(await readJsonBody(request))
  if (body === undefined || typeof body.startId !== 'string' || !('input' in body)) {
    sendWireError(response, 400, untaggedWireErrorBody(WIRE_MESSAGES.badBody))
    return undefined
  }
  return { startId: body.startId, input: body.input }
}

async function handleRun(context: JobikRouteContext): Promise<void> {
  const discovered = flowOf(context)
  if (discovered === undefined) return
  const body = await runBodyOf(context.request, context.response)
  if (body === undefined) return

  // The flow root every trimmed stack frame is measured against. `bindingPath` is the entrypoint
  // `jobik.config.ts` names, so its directory is the flow's own code and nothing else.
  const flowRoot = path.dirname(discovered.bindingPath)

  const controller = new AbortController()
  const runToken = registerRun(controller)
  const stream = openEventStream(context.response)

  // A browser that closes the tab must not leave a handler running for the rest of the process.
  context.response.on('close', () => {
    if (!stream.finished) controller.abort()
  })

  stream.write({ type: 'run-accepted', runToken })

  try {
    const result = await runStart({
      flow: discovered.flow,
      startId: body.startId,
      input: body.input,
      options: {
        signal: controller.signal,
        onEvent: (event) => stream.write(toRunWireEvent({ event, flowRoot })),
      },
    })
    // A report already arrived as `run-settled` through `onEvent`. Only a RunStartError — a run
    // that never started — still needs a line, and it is always the last one.
    if (result instanceof Error) {
      stream.write({ type: 'run-failed', error: toRunStartWireError(result) })
    }
  } finally {
    releaseRun(runToken)
    stream.end()
  }
}

export const jobikRunRoutes: readonly JobikRoute[] = [
  { method: 'POST', pattern: '/api/flows/:id/run', handle: handleRun },
  {
    method: 'POST',
    pattern: '/api/runs/:token/cancel',
    handle: async (context) => {
      if (!cancelRun(context.params.token ?? '')) {
        sendWireError(context.response, 404, untaggedWireErrorBody(WIRE_MESSAGES.notFound))
        return
      }
      // 200 with a JSON body rather than 204: every response on this surface parses as JSON.
      sendJson(context.response, 200, { cancelled: true })
    },
  },
]

/**
 * Every route a Studio server serves. `startJobikServer({ config, routes: jobikAllRoutes })`.
 *
 * The 4 MiB request-body cap a run request is subject to belongs to P10's `readJsonBody` and is
 * not restated here — one cap, in one place.
 */
export const jobikAllRoutes: readonly JobikRoute[] = [...jobikFlowRoutes, ...jobikRunRoutes]
