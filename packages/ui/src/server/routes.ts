import type { IncomingMessage, ServerResponse } from 'node:http'
import type { FlowRegistry } from './discovery.js'
import { listFlows, loadFlow, saveFlow, validateDraft } from './flowService.js'
import {
  isJobikError,
  toWireErrorBody,
  untaggedWireErrorBody,
  WIRE_MESSAGES,
  type WireErrorBody,
  wireErrorStatus,
} from './wireError.js'

/**
 * The non-run HTTP surface: list, load, validate, save.
 *
 * The spec calls the exact URL shapes an implementation detail; these are the shapes P14 consumes.
 * Every response body is JSON, and every failing body is a `WireErrorBody` — a tagged projection or
 * an untagged constant. Nothing here reaches for `error.message`, a path, or a cause.
 *
 * P13 EXTENSION POINT: run, stream, cancel, asset and extension-bundle routes are appended by
 * passing `[...jobikFlowRoutes, ...jobikRunRoutes]` to `createJobikRequestListener`. This table is
 * not edited.
 */

/** 4 MiB. A flow document is graph composition, never payload; anything larger is a mistake. */
const MAX_REQUEST_BYTES = 4 * 1024 * 1024

/**
 * The methods that reach a handler without declaring a media type. Everything else is
 * state-changing and must be preflighted — see `requireJsonRequest` below.
 */
const BODY_FREE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD'])

/**
 * Whether the request declares a JSON body.
 *
 * `application/json`, with or without parameters (`; charset=utf-8`), case-insensitively. That is
 * every form a legitimate client sends and nothing else: no `+json` suffix matching, no parameter
 * parsing, no wildcard. A stricter test than needed is the safe direction for a gate whose whole
 * job is to be un-forgeable from a cross-origin page.
 */
function declaresJsonBody(request: IncomingMessage): boolean {
  const declared = request.headers['content-type']
  if (declared === undefined) return false
  return declared.split(';', 1)[0].trim().toLowerCase() === 'application/json'
}

export type JobikRouteContext = {
  readonly request: IncomingMessage
  readonly response: ServerResponse
  readonly url: URL // P13 owns query string parsing and route dispatch
  readonly params: Readonly<Record<string, string>>
  readonly registry: FlowRegistry
}

export type JobikRoute = {
  readonly method: string
  /** `/api/flows/:id/save`. A `:name` segment captures one decoded path segment. */
  readonly pattern: string
  readonly handle: (context: JobikRouteContext) => Promise<void>
}

export function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  })
  response.end(text)
}

export function sendWireError(response: ServerResponse, status: number, body: WireErrorBody): void {
  sendJson(response, status, body)
}

/** A tagged error becomes its projection and its mapped status; anything else becomes a 500. */
function sendFailure(response: ServerResponse, error: unknown): void {
  sendJson(
    response,
    isJobikError(error) ? wireErrorStatus(error._tag) : 500,
    toWireErrorBody(error),
  )
}

/**
 * Read a JSON request body.
 *
 * The result is a discriminated wrapper, not `unknown | Error`: a valid body may itself be any JSON
 * value, so `T | Error` collapses to `unknown` and stops narrowing.
 */
export async function readJsonBody(
  request: IncomingMessage,
): Promise<{ readonly ok: true; readonly value: unknown } | { readonly ok: false }> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_REQUEST_BYTES) return { ok: false }
    chunks.push(buffer)
  }
  if (chunks.length === 0) return { ok: false }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  } catch {
    return { ok: false }
  }
}

function sendBadBody(response: ServerResponse): void {
  sendWireError(response, 400, untaggedWireErrorBody(WIRE_MESSAGES.badBody))
}

/** A plain, non-null object, so `in` checks below are safe. Narrowing is kept on one local. */
function objectBodyOf(
  result: { readonly ok: true; readonly value: unknown } | { readonly ok: false },
): Record<string, unknown> | undefined {
  if (!result.ok) return undefined
  const value = result.value
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

/** Resolve `:id` against the registry, answering 404 with an untagged body when it is unknown. */
function flowOf(context: JobikRouteContext) {
  const discovered = context.registry.get(context.params.id ?? '')
  if (discovered === undefined) {
    sendWireError(context.response, 404, untaggedWireErrorBody(WIRE_MESSAGES.flowNotFound))
    return undefined
  }
  return discovered
}

export const jobikFlowRoutes: readonly JobikRoute[] = [
  {
    method: 'GET',
    pattern: '/api/flows',
    handle: async (context) => {
      sendJson(context.response, 200, { flows: listFlows(context.registry) })
    },
  },
  {
    method: 'GET',
    pattern: '/api/flows/:id',
    handle: async (context) => {
      const discovered = flowOf(context)
      if (discovered === undefined) return
      const loaded = await loadFlow(discovered)
      if (loaded instanceof Error) {
        sendFailure(context.response, loaded)
        return
      }
      sendJson(context.response, 200, {
        descriptor: loaded.descriptor,
        document: loaded.document,
        revision: loaded.revision,
      })
    },
  },
  {
    method: 'POST',
    pattern: '/api/flows/:id/validate',
    handle: async (context) => {
      const discovered = flowOf(context)
      if (discovered === undefined) return
      const body = objectBodyOf(await readJsonBody(context.request))
      if (body === undefined || !('document' in body)) {
        sendBadBody(context.response)
        return
      }
      const result = validateDraft({ flow: discovered, draft: body.document })
      // A draft that does not validate is a RESULT, not a transport failure: the editor validates
      // after every edit and must not read a 4xx as a broken connection.
      //
      // The projection goes through `toWireErrorBody`, which gates on `isJobikError`, rather than
      // through the bare `toWireError` the closeout wire audit flagged here: `DraftValidation.error`
      // is typed `jobik.JobikError`, so the exhaustive switch is a type-level guarantee only. An
      // untyped error reaching a bare `toWireError` falls off the end of the switch and returns
      // `undefined`, which `JSON.stringify` drops — a silently fieldless failure. The gate turns
      // that into the untagged constant the rest of the surface already sends.
      sendJson(
        context.response,
        200,
        result.valid ? { valid: true } : { valid: false, ...toWireErrorBody(result.error) },
      )
    },
  },
  {
    method: 'POST',
    pattern: '/api/flows/:id/save',
    handle: async (context) => {
      const discovered = flowOf(context)
      if (discovered === undefined) return
      const body = objectBodyOf(await readJsonBody(context.request))
      if (
        body === undefined ||
        !('document' in body) ||
        typeof body.expectedRevision !== 'string'
      ) {
        sendBadBody(context.response)
        return
      }
      const saved = await saveFlow({
        flow: discovered,
        draft: body.document,
        expectedRevision: body.expectedRevision,
      })
      if (saved instanceof Error) {
        sendFailure(context.response, saved)
        return
      }
      sendJson(context.response, 200, { revision: saved.revision })
    },
  },
]

type RouteMatch = { readonly route: JobikRoute; readonly params: Record<string, string> }

/**
 * Exact segment count, `:name` captures one decoded segment. No optional segments.
 *
 * One wildcard form exists: a pattern whose LAST segment is `*` matches every pathname under the
 * segments before it, at any depth, and captures nothing — a wildcard route reads `context.url`
 * itself. It is the static-asset shape (`studioAssets.ts`) and no API route uses it.
 */
function matchPattern(pattern: string, pathname: string): Record<string, string> | undefined {
  const expected = pattern.split('/')
  const actual = pathname.split('/')
  const prefix = expected.at(-1) === '*' ? expected.length - 1 : undefined
  if (prefix === undefined ? expected.length !== actual.length : actual.length < prefix) {
    return undefined
  }
  const params: Record<string, string> = {}
  for (let index = 0; index < (prefix ?? expected.length); index += 1) {
    const segment = expected[index]
    if (segment.startsWith(':')) {
      params[segment.slice(1)] = decodeURIComponent(actual[index])
      continue
    }
    if (segment !== actual[index]) return undefined
  }
  return params
}

function findRoute(
  routes: readonly JobikRoute[],
  method: string,
  pathname: string,
): RouteMatch | 'method-not-allowed' | undefined {
  let pathMatched = false
  for (const route of routes) {
    const params = matchPattern(route.pattern, pathname)
    if (params === undefined) continue
    // A wildcard matches every path, so it must not turn an unknown path into a 405: only a
    // literal pattern is evidence that this path exists under some other method.
    if (!route.pattern.endsWith('/*')) pathMatched = true
    if (route.method === method) return { route, params }
  }
  return pathMatched ? 'method-not-allowed' : undefined
}

/**
 * The request listener. `routes` defaults to the four non-run routes; P13 passes a longer array.
 *
 * A handler that throws is a bug, not an expected failure, so it becomes a constant 500 body: the
 * thrown value is never inspected and therefore cannot leak.
 */
export function createJobikRequestListener(args: {
  registry: FlowRegistry
  routes?: readonly JobikRoute[]
}): (request: IncomingMessage, response: ServerResponse) => void {
  const routes = args.routes ?? jobikFlowRoutes
  return (request, response) => {
    let url: URL
    let match: RouteMatch | 'method-not-allowed' | undefined
    try {
      url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
      match = findRoute(routes, request.method ?? 'GET', url.pathname)
    } catch {
      // Malformed URL target (e.g., invalid percent-escape)
      if (!response.headersSent) {
        sendWireError(response, 400, untaggedWireErrorBody(WIRE_MESSAGES.malformedTarget))
      }
      return
    }

    if (match === undefined) {
      sendWireError(response, 404, untaggedWireErrorBody(WIRE_MESSAGES.notFound))
      return
    }
    if (match === 'method-not-allowed') {
      sendWireError(response, 405, untaggedWireErrorBody(WIRE_MESSAGES.methodNotAllowed))
      return
    }

    // The cross-origin side-effect gate, and the reason this server needs no CSRF token.
    //
    // Same-origin policy hides the RESPONSE, never the EFFECT. A `POST` whose `content-type` is
    // one of the three CORS-simple values — `text/plain`, `application/x-www-form-urlencoded`,
    // `multipart/form-data` — is sent by the browser with no preflight at all, so a page on any
    // origin could make this server save a document or start a run and simply not read the reply.
    // Binding to `127.0.0.1` does not answer that: the attacker's page runs in the victim's own
    // browser, which is on `127.0.0.1` too.
    //
    // `application/json` is not a CORS-simple value, so demanding it makes the browser preflight
    // every state-changing request, and this server answers no `OPTIONS` — the preflight fails and
    // the request is never sent. The gate is over the METHOD, not over the presence of a body:
    // `POST /api/runs/:token/cancel` carries no body and is state-changing all the same.
    //
    // It sits AFTER route matching so an unknown path is still a 404 and a wrong method still a
    // 405 — the gate answers for routes that exist, not for the shape of the URL. 415 is the
    // status; `WIRE_MESSAGES` is a closed set with no media-type constant, so `badBody` carries it.
    if (!BODY_FREE_METHODS.has(match.route.method) && !declaresJsonBody(request)) {
      sendWireError(response, 415, untaggedWireErrorBody(WIRE_MESSAGES.badBody))
      return
    }

    match.route
      .handle({ request, response, url, params: match.params, registry: args.registry })
      .catch(() => {
        if (response.headersSent) {
          response.end()
          return
        }
        sendWireError(response, 500, untaggedWireErrorBody(WIRE_MESSAGES.internal))
      })
  }
}
