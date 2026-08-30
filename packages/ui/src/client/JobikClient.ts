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

const UNREADABLE: WireErrorPayload = { _tag: null, message: 'Internal server error' }

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
