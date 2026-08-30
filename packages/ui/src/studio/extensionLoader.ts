import * as errore from 'errore'
import type { FlowUiDescriptor } from '../output/index.js'
import { isFlowUiDescriptor } from '../output/index.js'

/**
 * `## Flow-local output UI`: loading the browser bundle of a flow's `flow.ui.tsx`.
 *
 * The server builds that bundle with `react`, `react-dom`, `@jobik/ui` and `@jobik/core` external,
 * so the module leaves with BARE SPECIFIERS and no browser can import it as it stands. The server's
 * bundler is another plan's file, so the resolution happens here: the Studio publishes the module
 * namespaces it already holds on a global, each becomes a shim module at a `blob:` URL, and every
 * bare specifier in the fetched source is rewritten to point at its shim before evaluation.
 *
 * `importModule` is injected because jsdom implements neither `URL.createObjectURL` nor `import()`
 * of a `blob:` URL. Tests substitute it; the browser gets the real one.
 */

export class FlowUiLoadError extends errore.createTaggedError({
  name: 'FlowUiLoadError',
}) {
  /** The bare specifier that could not be resolved, when that is why the load failed. */
  readonly specifier: string | undefined

  constructor(args: { message: string; specifier?: string; cause?: unknown }) {
    super(args)
    this.specifier = args.specifier
  }
}

/** Every specifier the server's bundler externalises, plus the JSX runtimes it emits. */
export const BUNDLE_EXTERNALS: readonly string[] = [
  '@jobik/core',
  '@jobik/ui',
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-dev-runtime',
  'react/jsx-runtime',
]

export type ExternalModules = Readonly<Record<string, Readonly<Record<string, unknown>>>>

/** `import x from 'a'` · `import 'a'` · `export { x } from 'a'` · `import('a')`. */
const SPECIFIER_PATTERN = /(?:\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"]+)\1/g

function isBare(specifier: string): boolean {
  return !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.includes('://')
}

export function findBareSpecifiers(source: string): readonly string[] {
  const found: string[] = []
  for (const match of source.matchAll(SPECIFIER_PATTERN)) {
    const specifier = match[2] ?? ''
    if (isBare(specifier) && !found.includes(specifier)) found.push(specifier)
  }
  return found
}

export function rewriteBareSpecifiers(
  source: string,
  resolve: (specifier: string) => string | undefined,
): string | FlowUiLoadError {
  let unresolved: string | undefined

  const rewritten = source.replace(SPECIFIER_PATTERN, (whole, quote: string, specifier: string) => {
    if (!isBare(specifier)) return whole
    const url = resolve(specifier)
    if (url === undefined) {
      unresolved ??= specifier
      return whole
    }
    return whole.replace(`${quote}${specifier}${quote}`, `${quote}${url}${quote}`)
  })

  if (unresolved !== undefined) {
    return new FlowUiLoadError({
      message: `no module is registered for the bare specifier ${unresolved}`,
      specifier: unresolved,
    })
  }

  return rewritten
}

const REGISTRY = '__JOBIK_EXTERNALS__'

/**
 * The source of a module that re-exports one live namespace's own keys off the global registry.
 *
 * The names are read from the namespace at generation time, because ESM cannot re-export an
 * object's properties dynamically. Only valid identifiers are re-exported; anything else is
 * unreachable from an `import { … }` anyway. This is what `loadFlowUi` actually publishes — it is
 * what makes `import { defineFlowUi } from '@jobik/ui'` resolve inside the fetched bundle.
 */
export function shimSourceFor(
  specifier: string,
  namespace: Readonly<Record<string, unknown>>,
): string {
  const literal = JSON.stringify(specifier)
  const names = Object.keys(namespace).filter(
    (name) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) && name !== 'default',
  )
  return [
    `const ns = globalThis.${REGISTRY}[${literal}];`,
    ...names.map((name) => `export const ${name} = ns[${JSON.stringify(name)}];`),
    `export default ns.default ?? ns;`,
  ].join('\n')
}

function defaultImportModule(url: string): Promise<unknown> {
  return import(/* @vite-ignore */ url)
}

function toBlobUrl(source: string): string {
  // jsdom implements neither `Blob` for modules nor `URL.createObjectURL`; a `data:` URL is a
  // legitimate module URL and keeps this code path identical in both environments.
  if (typeof URL.createObjectURL !== 'function') {
    return `data:text/javascript,${encodeURIComponent(source)}`
  }
  return URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
}

export async function loadFlowUi(args: {
  fetchBundle: () => Promise<string>
  externals: ExternalModules
  importModule?: (url: string) => Promise<unknown>
}): Promise<FlowUiDescriptor | Error> {
  const importModule = args.importModule ?? defaultImportModule

  let source: string
  try {
    source = await args.fetchBundle()
  } catch (cause) {
    return new FlowUiLoadError({ message: 'the server did not serve a bundle', cause })
  }

  const shimUrls = new Map<string, string>()
  const revoke: string[] = []

  const resolve = (specifier: string): string | undefined => {
    const cached = shimUrls.get(specifier)
    if (cached !== undefined) return cached
    const namespace = args.externals[specifier]
    if (namespace === undefined) return undefined

    const registry = (globalThis as Record<string, unknown>)[REGISTRY] as
      | Record<string, unknown>
      | undefined
    const table = registry ?? {}
    table[specifier] = namespace
    ;(globalThis as Record<string, unknown>)[REGISTRY] = table

    const url = toBlobUrl(shimSourceFor(specifier, namespace))
    shimUrls.set(specifier, url)
    revoke.push(url)
    return url
  }

  const rewritten = rewriteBareSpecifiers(source, resolve)
  if (rewritten instanceof Error) return rewritten

  const moduleUrl = toBlobUrl(rewritten)
  revoke.push(moduleUrl)

  try {
    const module = (await importModule(moduleUrl)) as { default?: unknown }
    if (!isFlowUiDescriptor(module.default)) {
      return new FlowUiLoadError({
        message: 'its default export is not a defineFlowUi() descriptor',
      })
    }
    return module.default
  } catch (cause) {
    return new FlowUiLoadError({ message: 'evaluating the bundle failed', cause })
  } finally {
    for (const url of revoke) {
      if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)
    }
  }
}
