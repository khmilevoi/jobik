import path from 'node:path'
import type { InlineConfig } from 'vite'

/**
 * `## Server API`: "serve the browser bundle of a flow-local UI extension."
 *
 * `flow.ui.tsx` is TSX that lives next to the flow, so it cannot be handed to a browser as it is
 * and Node cannot type-strip its JSX either. Vite's build API turns it into one ES module, with
 * React and `@jobik/ui` left as bare imports: the Studio bundle already contains both, and
 * shipping a second copy of React inside an extension would give the page two renderers.
 *
 * Vite is imported dynamically. It is a large module tree that a server which never serves an
 * extension should not pay for at startup, and keeping it out of the static graph keeps
 * `@jobik/ui/server`'s cold start where P10 left it.
 *
 * The failure path is deliberately asymmetric. An author needs the real compiler message, which
 * names absolute paths; the browser must never see one. So the message goes to the server console
 * and the route answers a constant. There is no tag for this in the frozen taxonomy and none is
 * added.
 */

/** Everything the Studio page already provides. Subpaths included: `react/jsx-runtime` matters. */
const EXTERNAL: RegExp[] = [
  /^react($|\/)/,
  /^react-dom($|\/)/,
  /^@jobik\/ui($|\/)/,
  /^@jobik\/core($|\/)/,
]

/** One entry per `uiPath`. A successful bundle is kept for the life of the process. */
const bundles = new Map<string, Promise<string | Error>>()

/** Drop every memoised bundle. Tests call it; nothing in the server does. */
export function clearExtensionBundleCache(): void {
  bundles.clear()
}

async function bundleExtension(uiPath: string): Promise<string | Error> {
  try {
    const { build } = await import('vite')
    const config: InlineConfig = {
      // The flow has no vite config of its own and must not inherit the Studio's.
      configFile: false,
      logLevel: 'silent',
      root: path.dirname(uiPath),
      // Oxc's automatic-runtime default otherwise tracks `process.env.NODE_ENV`: it computes
      // `development` as `!isProduction`, and `isProduction` is only true when `NODE_ENV` is
      // exactly `'production'` — which it ordinarily is not, `mode` here notwithstanding. So an
      // unset `NODE_ENV` in production is the case that matters; forcing this off is what keeps
      // `react/jsx-runtime` (and no `_jsxFileName` absolute path) in the bundle regardless.
      oxc: { jsx: { development: false } },
      build: {
        // Keep the bundle in memory: it is served, not written next to the author's flow.
        write: false,
        minify: false,
        target: 'es2022',
        lib: { entry: uiPath, formats: ['es'], fileName: 'flow-ui' },
        // Vite 8 builds with rolldown; `rollupOptions` is a deprecated alias for this.
        rolldownOptions: { external: EXTERNAL },
      },
    }
    const result = await build(config)
    const output = Array.isArray(result) ? result[0] : result
    if (output === undefined || !('output' in output)) {
      const error = new Error(`jobik: bundling '${uiPath}' produced no output`)
      console.error(`jobik: cannot bundle the flow UI extension '${uiPath}'`, error)
      return error
    }
    const chunk = output.output.find((item) => item.type === 'chunk' && item.isEntry)
    if (chunk === undefined || chunk.type !== 'chunk') {
      const error = new Error(`jobik: bundling '${uiPath}' produced no entry chunk`)
      console.error(`jobik: cannot bundle the flow UI extension '${uiPath}'`, error)
      return error
    }
    return chunk.code
  } catch (cause) {
    console.error(`jobik: cannot bundle the flow UI extension '${uiPath}'`, cause)
    return cause instanceof Error ? cause : new Error(String(cause))
  }
}

/**
 * The browser bundle for one flow's `flow.ui.tsx`, built once per path.
 *
 * A failure is not memoised: the author fixes the file and reloads, without restarting the server.
 * A success is, because rebuilding on every request would make opening the output viewer slow.
 */
export function buildExtensionBundle(args: { uiPath: string }): Promise<string | Error> {
  const cached = bundles.get(args.uiPath)
  if (cached !== undefined) return cached
  const pending = bundleExtension(args.uiPath).then((result) => {
    if (result instanceof Error) bundles.delete(args.uiPath)
    return result
  })
  bundles.set(args.uiPath, pending)
  return pending
}
