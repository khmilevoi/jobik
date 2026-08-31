import * as fs from 'node:fs/promises'
import type { ServerResponse } from 'node:http'
import path from 'node:path'
import { type JobikRoute, type JobikRouteContext, sendWireError } from './routes.js'
import { jobikAllRoutes } from './runRoutes.js'
import { untaggedWireErrorBody, WIRE_MESSAGES } from './wireError.js'

/**
 * The static half of the Studio server: `vite build` writes `dist/studio`, this serves it.
 *
 * Without this module the bundle is dead weight — in the repository it can only be opened by
 * pointing a second static server at it, and in the published tarball not at all. Both were
 * recorded as deferred findings (8-D and 11); this closes them.
 *
 * Three properties the rest of the file exists to hold:
 *
 * 1. **The bundle is found relative to THIS module, never to `process.cwd()`.** A CLI is started
 *    from the user's directory, not from the package, so `cwd` says nothing about where the
 *    package's own build output lives. See `STUDIO_BUNDLE_CANDIDATES`.
 * 2. **A URL never names a file outside the bundle.** Serving a path a request chose is a
 *    traversal surface; `fileInBundle` is the confinement, and it is deliberately paranoid.
 * 3. **`/api/*` is untouched.** The route is a wildcard, so it matches every unclaimed `GET`,
 *    including a mistyped API path. Those still get the router's own JSON 404, because the
 *    Studio's client reads a failed API call as JSON and would choke on a page.
 */

/**
 * Where the built bundle can be, relative to this module. First hit wins.
 *
 * - Installed package: this module is bundled into `<pkg>/dist/server.mjs`, so the bundle is the
 *   sibling `studio/` directory.
 * - This workspace: this module is `<pkg>/src/server/studioAssets.ts`, two levels below the
 *   package root, so the bundle is `<pkg>/dist/studio`.
 *
 * Both are checked every time rather than picked by guessing which layout is live: the check is
 * one `stat`, and guessing wrong would be a 404 nobody could explain.
 */
const STUDIO_BUNDLE_CANDIDATES: readonly string[] = [
  path.resolve(import.meta.dirname, 'studio'),
  path.resolve(import.meta.dirname, '../../dist/studio'),
]

/** The bundle's entry document. Its presence is what marks a candidate directory as the bundle. */
const STUDIO_INDEX = 'index.html'

/**
 * Extension to `content-type`. A bundle is HTML, hashed JS and CSS plus whatever Vite copied from
 * `public/`, so the map covers the web asset types and nothing else; anything unlisted is served
 * as an opaque download rather than guessed at.
 */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
}

/**
 * The message a request gets when nobody has built the bundle.
 *
 * Plain text, not a `WireErrorBody`: this answers a top-level browser navigation, so it is read by
 * a person, and `WIRE_MESSAGES` has no constant that would tell them what to run. It names a
 * command and a relative directory — never an absolute path, which is the one thing that must not
 * cross to a browser.
 */
const BUNDLE_MISSING_MESSAGE = [
  'The Jobik Studio bundle has not been built.',
  '',
  'Run `pnpm --filter @jobik/ui run build:studio` from the repository root (or `vite build`',
  'inside packages/ui) to produce dist/studio, then reload this page.',
  '',
].join('\n')

async function isFile(candidate: string): Promise<boolean> {
  const stats = await fs.stat(candidate).catch(() => undefined)
  return stats?.isFile() === true
}

/**
 * The directory holding the built bundle, or `undefined` when it has not been built.
 *
 * Resolved per request rather than once at startup: `pnpm dev` builds the bundle before the server
 * starts, but a developer who rebuilds it while the server is up should not have to restart. A
 * successful answer is cached, since a bundle directory never moves within one process.
 */
let cachedBundleDir: string | undefined

export async function resolveStudioBundleDir(): Promise<string | undefined> {
  if (cachedBundleDir !== undefined) return cachedBundleDir
  for (const candidate of STUDIO_BUNDLE_CANDIDATES) {
    if (await isFile(path.join(candidate, STUDIO_INDEX))) {
      cachedBundleDir = candidate
      return candidate
    }
  }
  return undefined
}

/**
 * The absolute file a pathname asks for, or `undefined` when it asks for anything outside the
 * bundle.
 *
 * Each segment is decoded on its own and rejected if it is `.`, `..`, or carries a separator or a
 * NUL. Decoding per segment is the point: `%2e%2e`, `..%5c` and `%00` all survive WHATWG URL
 * parsing intact, so a check against the raw pathname would miss every one of them. The
 * containment check on the resolved path then backstops the segment filter — on Windows a bare
 * drive letter such as `C:` carries no separator but still re-roots `path.resolve`.
 *
 * A pathname that names no segment at all (`/`) resolves to the bundle's `index.html`.
 */
function fileInBundle(bundleDir: string, pathname: string): string | undefined {
  const decoded: string[] = []
  for (const segment of pathname.split('/')) {
    if (segment.length === 0) continue
    let value: string
    try {
      value = decodeURIComponent(segment)
    } catch {
      return undefined
    }
    if (value === '.' || value === '..') return undefined
    if (value.includes('/') || value.includes('\\') || value.includes('\0')) return undefined
    decoded.push(value)
  }

  const root = path.resolve(bundleDir)
  const resolved = path.resolve(root, ...decoded, ...(decoded.length === 0 ? [STUDIO_INDEX] : []))
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return undefined
  return resolved
}

/**
 * Vite emits `assets/` with a content hash in every filename, so those may be cached forever; the
 * entry document must never be, or a rebuilt bundle would keep serving the previous asset names.
 */
function cacheControlFor(relative: string): string {
  const first = relative.split(path.sep)[0]
  return first === 'assets' ? 'public, max-age=31536000, immutable' : 'no-store'
}

function sendBytes(
  response: ServerResponse,
  status: number,
  headers: Readonly<Record<string, string>>,
  body: Buffer | string,
): void {
  const bytes = typeof body === 'string' ? Buffer.from(body, 'utf8') : body
  response.writeHead(status, { ...headers, 'content-length': bytes.byteLength })
  response.end(bytes)
}

function sendNotFound(response: ServerResponse): void {
  sendWireError(response, 404, untaggedWireErrorBody(WIRE_MESSAGES.notFound))
}

async function serveStudioAsset(
  context: JobikRouteContext,
  bundleDirOverride: string | undefined,
): Promise<void> {
  const pathname = context.url.pathname

  // The wildcard matched, which means no API route did. Answer as the router would have.
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    sendNotFound(context.response)
    return
  }

  // A directory is the bundle only if it holds the entry document — an override is held to the
  // same test as a discovered candidate, so pointing at an unbuilt directory reports the build,
  // not a wall of 404s.
  const bundleDir =
    bundleDirOverride === undefined
      ? await resolveStudioBundleDir()
      : (await isFile(path.join(bundleDirOverride, STUDIO_INDEX)))
        ? bundleDirOverride
        : undefined
  if (bundleDir === undefined) {
    // 503, not 404: the route exists and the request is fine — the build output is missing.
    sendBytes(
      context.response,
      503,
      { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
      BUNDLE_MISSING_MESSAGE,
    )
    return
  }

  const file = fileInBundle(bundleDir, pathname)
  if (file === undefined || !(await isFile(file))) {
    // No SPA fallback. The Studio has no client-side router — it never mounts a URL other than
    // `/` — so answering an unknown path with `index.html` would turn every typo and every stale
    // link into a blank shell that looks like a broken app. A 404 is the honest answer, and it is
    // the same body the router already gives an unknown path.
    sendNotFound(context.response)
    return
  }

  const body = await fs.readFile(file)
  sendBytes(
    context.response,
    200,
    {
      'content-type': CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': cacheControlFor(path.relative(path.resolve(bundleDir), file)),
    },
    body,
  )
}

/**
 * The routes that serve the built Studio.
 *
 * One wildcard `GET` route, which is why it MUST be registered last: `findRoute` returns the first
 * route whose pattern and method both match, so anything after it would be unreachable.
 *
 * `bundleDir` overrides the search described on `STUDIO_BUNDLE_CANDIDATES`. It exists for tests and
 * for an embedder serving a bundle it built itself; a normal caller passes nothing.
 */
export function createStudioAssetRoutes(
  options: { readonly bundleDir?: string } = {},
): readonly JobikRoute[] {
  return [
    {
      method: 'GET',
      pattern: '/*',
      handle: (context) => serveStudioAsset(context, options.bundleDir),
    },
  ]
}

/** The Studio's static routes over the bundle this package shipped. */
export const jobikStudioAssetRoutes: readonly JobikRoute[] = createStudioAssetRoutes()

/**
 * Everything a Studio server serves: the JSON API first, the static bundle last.
 *
 * `startJobikServer({ config, routes: jobikStudioServerRoutes })` is the whole app.
 * `jobikAllRoutes` remains the API-only set, for an embedder that serves the UI itself.
 */
export const jobikStudioServerRoutes: readonly JobikRoute[] = [
  ...jobikAllRoutes,
  ...jobikStudioAssetRoutes,
]
