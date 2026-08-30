import type { AssetDescriptor, FlowDocument } from '@jobik/core'
import { JobikServerError, JobikTransportError } from './errors.js'
import { readNdjsonStream } from './ndjson.js'
import type {
  FlowListItem,
  LoadedFlowPayload,
  RunStreamEvent,
  SavePayload,
  ValidatePayload,
  WireErrorPayload,
} from './wire.js'

/**
 * The browser's client for `@jobik/ui/server`.
 *
 * Every method returns `T | Error` and never throws — `## Errors`. A transport failure is a
 * `JobikTransportError`; any non-2xx is a `JobikServerError` carrying the status and the exact
 * error body the server sent.
 *
 * One exception, documented in full at `startRun` below: that method's own Promise never
 * rejects, but the async generator it resolves with can still throw `NdjsonParseError` mid-
 * iteration if the server violates the NDJSON protocol partway through an already-open stream.
 *
 * `baseUrl` defaults to `''`, which makes every URL same-origin and relative. That is what the
 * built Studio wants, and `vite.config.ts` proxies `/api` in dev so it holds there too.
 */

export type JobikClientOptions = {
  readonly baseUrl?: string
  readonly fetch?: typeof globalThis.fetch
}

export type JobikClient = {
  listFlows(): Promise<readonly FlowListItem[] | Error>
  loadFlow(flowId: string): Promise<LoadedFlowPayload | Error>
  validate(flowId: string, document: FlowDocument): Promise<ValidatePayload | Error>
  save(
    flowId: string,
    document: FlowDocument,
    expectedRevision: string,
  ): Promise<SavePayload | Error>
  /**
   * Starts a run. The returned Promise itself follows the same `T | Error` contract as every
   * other method here: a transport failure or a non-2xx response before the stream opens (e.g.
   * `StartNotFoundError`, `RunInputError`) resolves with an `Error` value, never a rejection.
   *
   * The one place this client does not fully honour "never throws": once the Promise has
   * resolved with the generator, **iterating it can throw**. `readNdjsonStream` (`./ndjson.js`)
   * throws `NdjsonParseError` from its own `.next()` if the server violates the NDJSON protocol
   * partway through an already-open stream — a malformed line, an unrecognised event type, or a
   * body that ends mid-line. This method does not catch that; it is the caller's `for await` that
   * must.
   */
  startRun(args: {
    flowId: string
    startId: string
    input: unknown
    signal?: AbortSignal
  }): Promise<AsyncGenerator<RunStreamEvent, void, undefined> | Error>
  cancelRun(runToken: string): Promise<true | Error>
  assetUrl(descriptor: AssetDescriptor): string
  extensionBundleUrl(flowId: string): string
}

/**
 * Synthesised when the server's error body cannot be read or parsed: a proxy's HTML error page, a
 * truncated response, a body that is not JSON. This payload is **client-authored, not
 * server-sent** — unlike every other `WireErrorPayload` this client returns, the server never
 * produced these exact bytes, so the message says so explicitly. It is deliberately distinct from
 * the server's own `WIRE_MESSAGES.internal` (`'Internal server error'`,
 * `packages/ui/src/server/wireError.ts`): the two must never collide, or a caller could not tell
 * "the server said so" from "the client could not read what the server said".
 */
const UNREADABLE: WireErrorPayload = {
  _tag: null,
  message: 'The Jobik client could not read the server error response',
}

async function payloadOf(response: Response): Promise<WireErrorPayload> {
  try {
    const body = (await response.json()) as { error?: WireErrorPayload }
    const error = body.error
    if (error !== undefined && typeof error.message === 'string') return error
    return UNREADABLE
  } catch {
    return UNREADABLE
  }
}

export function createJobikClient(options: JobikClientOptions = {}): JobikClient {
  const baseUrl = options.baseUrl ?? ''
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis)

  const urlOf = (path: string): string => `${baseUrl}${path}`

  const send = async (
    path: string,
    init?: RequestInit,
  ): Promise<Response | JobikTransportError> => {
    try {
      return await doFetch(urlOf(path), init)
    } catch (cause) {
      return new JobikTransportError({ url: urlOf(path), cause })
    }
  }

  const failure = async (response: Response): Promise<JobikServerError> => {
    const payload = await payloadOf(response)
    return new JobikServerError({ reason: payload.message, status: response.status, payload })
  }

  const getJson = async <T>(path: string): Promise<T | Error> => {
    const response = await send(path)
    if (response instanceof Error) return response
    if (!response.ok) return failure(response)
    try {
      return (await response.json()) as T
    } catch (cause) {
      return new JobikTransportError({ url: urlOf(path), cause })
    }
  }

  const postJson = async <T>(path: string, body?: unknown): Promise<T | Error> => {
    const response = await send(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    if (response instanceof Error) return response
    if (!response.ok) return failure(response)
    try {
      return (await response.json()) as T
    } catch (cause) {
      return new JobikTransportError({ url: urlOf(path), cause })
    }
  }

  return {
    async listFlows() {
      const body = await getJson<{ flows: readonly FlowListItem[] }>('/api/flows')
      return body instanceof Error ? body : body.flows
    },

    loadFlow(flowId) {
      return getJson<LoadedFlowPayload>(`/api/flows/${encodeURIComponent(flowId)}`)
    },

    validate(flowId, document) {
      return postJson<ValidatePayload>(`/api/flows/${encodeURIComponent(flowId)}/validate`, {
        document,
      })
    },

    save(flowId, document, expectedRevision) {
      return postJson<SavePayload>(`/api/flows/${encodeURIComponent(flowId)}/save`, {
        document,
        expectedRevision,
      })
    },

    async startRun(args) {
      const path = `/api/flows/${encodeURIComponent(args.flowId)}/run`
      const response = await send(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ startId: args.startId, input: args.input }),
        ...(args.signal === undefined ? {} : { signal: args.signal }),
      })
      if (response instanceof Error) return response
      if (!response.ok) return failure(response)
      // This Promise resolves here, successfully, with the generator itself. It does not — and,
      // being a Promise, cannot — catch a later `NdjsonParseError` the generator throws from its
      // own `.next()`; see the doc comment on `startRun` in the `JobikClient` type above.
      return readNdjsonStream(response)
    },

    async cancelRun(runToken) {
      const body = await postJson<{ cancelled: true }>(
        `/api/runs/${encodeURIComponent(runToken)}/cancel`,
      )
      return body instanceof Error ? body : true
    },

    assetUrl(descriptor) {
      return urlOf(`/api/assets/${encodeURIComponent(descriptor.id)}`)
    },

    extensionBundleUrl(flowId) {
      return urlOf(`/api/flows/${encodeURIComponent(flowId)}/ui.js`)
    },
  }
}
