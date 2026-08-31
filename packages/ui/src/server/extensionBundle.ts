import { createHash } from 'node:crypto'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import type { InlineConfig } from 'vite'
import { findBundleDisclosures } from './bundleSafety.js'
import { cssTextOf } from './extensionCss.js'

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
 *
 * The *success* path needs the same asymmetry, and for a while did not have it. Rolldown labels
 * each inlined module with a `//#region <id>` comment, and the id is the module path relative to
 * rolldown's `cwd`, which defaults to `process.cwd()` — a directory that has nothing to do with
 * this flow. Started from anywhere but the project root that comment discloses the directory chain
 * above the flow; started from a different volume root (a `D:` cwd against a `C:` flow, or a UNC
 * cwd), `path.relative` gives up and returns the target absolute path, and the browser gets
 * `//#region C:/Users/…/flow.ui.tsx` in a 200 body. `cwd` below is the fix: ids become relative to
 * the flow directory and are then identical whatever the server's cwd is.
 *
 * `findBundleDisclosures` is the second half of it, because this is a class and not a string —
 * `//#region` is only what today's rolldown emits, and a sourcemap comment or an oxc
 * `_jsxFileName` would ride the same route. A bundle that still names a filesystem path is not
 * served at all.
 *
 * `unprovidedImports` is the third guard, over the graph rather than over the text. An
 * import rolldown cannot resolve does not fail a rolldown build: it becomes an external and stays
 * in the bundle as a bare specifier, which the browser then fails to load — a blank slot in the
 * output viewer and nothing on the server. Vite's own log handler turns the warned form of that
 * (`UNRESOLVED_IMPORT`) into a thrown build failure, and `logLevel: 'silent'` does not suppress
 * it, so a mistyped import already lands in the `catch` below; `extensionBundleImports.test.ts`
 * pins that so it cannot regress quietly. What it does NOT cover is an import left external with
 * no warning at all — `import { widget } from 'https://cdn.example.com/widget.js'` bundles
 * cleanly today and would have the Studio's own page pull code from a remote origin. So the
 * allowlist is checked against the emitted chunk as well, and `logLevel` keeps doing the one job
 * it was set for: not spraying build chatter into the server's stdout. No `onwarn` is installed
 * here — one would displace vite's own hard failure and make the warned case quieter, not louder.
 */

/** Everything the Studio page already provides. Subpaths included: `react/jsx-runtime` matters. */
const EXTERNAL: RegExp[] = [
  /^react($|\/)/,
  /^react-dom($|\/)/,
  /^@jobik\/ui($|\/)/,
  /^@jobik\/core($|\/)/,
]

/**
 * A module the build inlined, and the stamp it carried when it was read.
 *
 * `mtimeMs` and `size` together: `mtimeMs` is the change signal, `size` covers the filesystems
 * whose timestamp granularity is coarse enough for two quick edits to share one.
 */
type InputStamp = { readonly id: string; readonly stamp: string }

type BuiltBundle = { readonly code: string; readonly inputs: readonly InputStamp[] }

/** The attribute that marks a `<style>` element this bundle put in the page. */
const STYLE_ATTRIBUTE = 'data-jobik-flow-ui-style'

/**
 * The statement that puts the author's stylesheet in the page.
 *
 * The chunk is an ES module the Studio imports, so a top-level statement runs at import time —
 * before anything reads the default export, which is the only ordering the output viewer needs.
 * The CSS crosses into JavaScript through `JSON.stringify` and nothing else: it is author text and
 * may hold quotes, backslashes and newlines.
 */
function styleInjectionPrelude(css: string): string {
  // Keyed on the stylesheet's own content, not on the flow: the sidebar switches flows without a
  // reload, so a second extension lands in the same `document` and must still get its styles. Two
  // flows that ship byte-identical CSS legitimately share one element. The flow's path would key
  // it too, and is exactly what may never reach the browser — see the header.
  const key = createHash('sha256').update(css).digest('hex').slice(0, 16)
  return [
    ';(() => {',
    `  if (document.querySelector(${JSON.stringify(`style[${STYLE_ATTRIBUTE}="${key}"]`)}) !== null) return`,
    `  const element = document.createElement('style')`,
    `  element.setAttribute(${JSON.stringify(STYLE_ATTRIBUTE)}, ${JSON.stringify(key)})`,
    `  element.textContent = ${JSON.stringify(css)}`,
    '  document.head.appendChild(element)',
    '})()',
  ].join('\n')
}

/** One entry per `uiPath`. A success is kept only while every module it was built from is intact. */
const bundles = new Map<string, Promise<BuiltBundle | Error>>()

let buildCount = 0

/** Drop every memoised bundle, and the build counter with it. Tests call it; the server does not. */
export function clearExtensionBundleCache(): void {
  bundles.clear()
  buildCount = 0
}

/**
 * How many bundles this process has actually built since the last cache clear.
 *
 * The same status as `inFlightRunCount()`: a canary for the tests. Two equal strings are
 * `Object.is`-equal whether or not a cache exists, so the count is the only thing that can tell a
 * memo hit from a rebuild that happened to produce the same bytes.
 */
export function extensionBundleBuildCount(): number {
  return buildCount
}

async function stampOf(id: string): Promise<string | undefined> {
  try {
    const stats = await stat(id)
    return `${stats.mtimeMs}:${stats.size}`
  } catch {
    return undefined
  }
}

/**
 * Stamp every module the build reported, plus the entry.
 *
 * Rolldown's module ids are not all files: virtual modules carry a `\0` prefix (its own runtime
 * chunk is one) and vite's browser shims are synthetic. Those are dropped here, and so is anything
 * `stat` cannot see — a module with no file behind it cannot change on disk. The entry is added
 * unconditionally so the key can never degenerate to nothing if rolldown changes how it spells an
 * id.
 */
async function stampInputs(uiPath: string, moduleIds: readonly string[]): Promise<InputStamp[]> {
  const candidates = new Set<string>([uiPath])
  for (const id of moduleIds) {
    if (id.startsWith('\0') || !path.isAbsolute(id)) continue
    candidates.add(id)
  }
  const stamped = await Promise.all(
    [...candidates].map(async (id) => ({ id, stamp: await stampOf(id) })),
  )
  return stamped.filter((entry): entry is InputStamp => entry.stamp !== undefined)
}

/** Whether every module the bundle was built from still carries the stamp it was read with. */
async function inputsUnchanged(inputs: readonly InputStamp[]): Promise<boolean> {
  const current = await Promise.all(inputs.map((input) => stampOf(input.id)))
  return inputs.every((input, index) => current[index] === input.stamp)
}

/**
 * The specifiers the entry chunk leaves for the browser to resolve, minus the sibling chunks a
 * split build emits. Anything left must be something the Studio page already has.
 */
function unprovidedImports(
  chunk: { readonly imports: readonly string[]; readonly dynamicImports: readonly string[] },
  emitted: ReadonlySet<string>,
): string[] {
  return [...chunk.imports, ...chunk.dynamicImports].filter(
    (specifier) => !emitted.has(specifier) && !EXTERNAL.some((pattern) => pattern.test(specifier)),
  )
}

async function bundleExtension(uiPath: string): Promise<BuiltBundle | Error> {
  try {
    const { build } = await import('vite')
    const flowRoot = path.dirname(uiPath)
    const config: InlineConfig = {
      // The flow has no vite config of its own and must not inherit the Studio's.
      configFile: false,
      logLevel: 'silent',
      root: flowRoot,
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
        rolldownOptions: {
          external: EXTERNAL,
          // NOT cosmetic, and not the same thing as `root` above: `root` is Vite's, `cwd` is
          // rolldown's, and the module ids rolldown writes into the chunk are relative to `cwd`.
          // Left at its `process.cwd()` default the served bundle depends on where the server was
          // started from — see the header. Anchored here, the ids are the flow's own layout and
          // nothing else.
          cwd: flowRoot,
        },
      },
    }
    buildCount += 1
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
    // An import nothing resolved. See the header: a rolldown build does not fail on one, it turns
    // it into an external, and the browser is then the first thing to notice — as a blank slot.
    // The author gets the specifier by name on the console instead.
    const unprovided = unprovidedImports(chunk, new Set(output.output.map((item) => item.fileName)))
    if (unprovided.length > 0) {
      const error = new Error(
        `jobik: the flow UI extension '${uiPath}' imports ${unprovided.length} module(s) the Studio page does not provide: ${unprovided.join(', ')}`,
      )
      console.error(
        `jobik: cannot serve the flow UI extension '${uiPath}' — these imports resolve to nothing the browser can load`,
        unprovided,
      )
      return error
    }
    // Vite emits the stylesheet as its own output item and puts no reference to it in the chunk,
    // so serving the chunk alone threw the author's styles away with nothing said. `cssCodeSplit`
    // resolves to false under `build.lib`, so several stylesheets are concatenated into this one
    // asset and there is never a second.
    const cssAsset = output.output.find(
      (item) => item.type === 'asset' && item.fileName.endsWith('.css'),
    )
    const cssText = cssAsset?.type === 'asset' ? cssTextOf(cssAsset.source) : undefined
    if (cssText instanceof Error) {
      // Not skipped: a stylesheet that silently does not arrive is the bug this whole change was
      // written to fix, so an unreadable one is refused outright rather than dropped.
      const error = new Error(
        `jobik: the flow UI bundle for '${uiPath}' has an unreadable stylesheet: ${cssText.message}`,
      )
      console.error(
        `jobik: refusing to serve the flow UI extension '${uiPath}' — its stylesheet asset '${cssAsset?.type === 'asset' ? cssAsset.fileName : ''}' is not text`,
        cssText.message,
      )
      return error
    }
    // Belt and braces: `cwd` above closes the id computation, this refuses to serve a body that
    // discloses a path anyway — through an annotation nobody here has seen yet, or a rolldown that
    // stops honouring `cwd`. Failing closed is right for a body no other layer inspects; the
    // author gets the offending tokens on the console and the route answers its constant 500.
    //
    // The stylesheet is swept too, and by the same function: it is a second author-written body
    // crossing to the browser on this one route, and `content: "C:/…"` discloses exactly what a
    // `//#region` comment does. Its findings carry line numbers into the CSS rather than into the
    // chunk, which is the file the author would go and edit anyway.
    const disclosures = [
      ...findBundleDisclosures(chunk.code),
      ...(cssText === undefined ? [] : findBundleDisclosures(cssText)),
    ]
    if (disclosures.length > 0) {
      const error = new Error(
        `jobik: the flow UI bundle for '${uiPath}' discloses ${disclosures.length} filesystem path(s)`,
      )
      console.error(
        `jobik: refusing to serve the flow UI extension '${uiPath}' — the bundle discloses filesystem paths`,
        disclosures,
      )
      return error
    }
    // The graph guard's other half, over assets rather than over imports. `build.lib` inlines
    // every local asset as a `data:` URI before `assetsInlineLimit` is even consulted, so the
    // stylesheet normally needs nothing served beside it; `?no-inline` is the one query that still
    // wins, and it emits a hashed file this single-response route has no way to hand over. The
    // author would get a broken background and no server line at all. Only *assets* count — a
    // dynamic import legitimately emits sibling chunks, which `unprovidedImports` already covers.
    const strayAssets = output.output.filter((item) => item.type === 'asset' && item !== cssAsset)
    if (strayAssets.length > 0) {
      const names = strayAssets.map((item) => item.fileName)
      const error = new Error(
        `jobik: the flow UI bundle for '${uiPath}' references ${names.length} asset(s) nothing serves: ${names.join(', ')}`,
      )
      console.error(
        `jobik: refusing to serve the flow UI extension '${uiPath}' — these assets were emitted as separate files that no route serves`,
        names,
      )
      return error
    }
    const code =
      cssText === undefined ? chunk.code : `${styleInjectionPrelude(cssText)}\n${chunk.code}`
    return { code, inputs: await stampInputs(uiPath, chunk.moduleIds) }
  } catch (cause) {
    console.error(`jobik: cannot bundle the flow UI extension '${uiPath}'`, cause)
    return cause instanceof Error ? cause : new Error(String(cause))
  }
}

function startBuild(uiPath: string): Promise<BuiltBundle | Error> {
  const pending: Promise<BuiltBundle | Error> = bundleExtension(uiPath).then((result) => {
    // A failure is not memoised: the author fixes the file and reloads, without restarting the
    // server. The identity check keeps this from evicting a build someone else already started.
    if (result instanceof Error && bundles.get(uiPath) === pending) bundles.delete(uiPath)
    return result
  })
  bundles.set(uiPath, pending)
  return pending
}

/**
 * The browser bundle for one flow's `flow.ui.tsx`.
 *
 * Memoised, but keyed on the modules the build reported inlining rather than on `uiPath` alone:
 * the route this feeds answers `cache-control: no-store`, and holding a bundle for the life of the
 * process made that header a lie — editing `flow.ui.tsx`, or any component it imports, needed a
 * server restart. A request that arrives while every module still carries the stamp it was read
 * with is answered from the memo and pays no build; a request that arrives after any of them
 * changed rebuilds. There is no watcher: nothing here rebuilds until a request asks.
 */
export async function buildExtensionBundle(args: { uiPath: string }): Promise<string | Error> {
  const cached = bundles.get(args.uiPath)
  if (cached !== undefined) {
    const built = await cached
    if (!(built instanceof Error)) {
      if (await inputsUnchanged(built.inputs)) return built.code
      // Stale. Evict only what we actually looked at — another request may already have replaced
      // it with a fresh build while this one was stat-ing.
      if (bundles.get(args.uiPath) === cached) bundles.delete(args.uiPath)
    }
  }
  const built = await (bundles.get(args.uiPath) ?? startBuild(args.uiPath))
  return built instanceof Error ? built : built.code
}
