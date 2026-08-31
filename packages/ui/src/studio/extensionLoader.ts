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

export type ExternalModules = Readonly<Record<string, Readonly<Record<string, unknown>>>>

/**
 * Matches when the code text right before a quote is `from` · `import` · `import(`, i.e. the
 * quote opens the specifier of `import x from 'a'` · `import 'a'` · `export { x } from 'a'` ·
 * `import('a')`. Used by `scanSpecifierOccurrences` below, never against raw source directly.
 */
const SPECIFIER_PREFIX = /(?:\bfrom\s*|\bimport\s*\(?\s*)$/

interface SpecifierOccurrence {
  readonly specifier: string
  /** Index of the opening quote. */
  readonly start: number
  /** Index one past the closing quote. */
  readonly end: number
  /** The quote character actually used, `'` or `"` — preserved so a rewrite keeps it. */
  readonly quote: string
}

/**
 * A single left-to-right scan of `source` that finds every `from '…'` / `import '…'` /
 * `import('…')` occurrence that is genuine code — never one that only *looks* like one because it
 * sits inside a `//` line comment, a `/* … * /` block comment, or an unrelated string literal.
 *
 * The subtlety: a specifier's own quoted literal (`'react'` in `from 'react'`) IS a string literal
 * syntactically — that is exactly what this scan is looking for — so "skip string literals" cannot
 * mean "never look inside a string." Instead, every quoted run (`'…'`, `"…"` or `` `…` ``) is read
 * as one opaque token from its opening quote to its matching, escape-aware closing quote; it is
 * only reported as a specifier when the code text immediately before it (skipping whitespace) ends
 * with `from` or `import(`. Any other quoted run — including one whose content happens to contain
 * text shaped like an import statement, e.g. `"please import 'lodash' manually"` — is consumed as
 * that one token and never re-scanned for a nested match. `rewriteBareSpecifiers` is this scan's
 * one caller.
 *
 * LIMITATION — regex literals are not tracked. A `/` that opens a regex literal (e.g.
 * `/from "x"/`) is read as ordinary code rather than as a regex boundary, so a `//`- or `/*`-shaped
 * sequence inside a regex body could still be misread as a comment start, and a quote inside one is
 * scanned as an ordinary string boundary. Telling division from a regex literal needs a real
 * parser; a half-attempt would misfire in both directions, so this case is left undetected here
 * rather than patched.
 */
function scanSpecifierOccurrences(source: string): readonly SpecifierOccurrence[] {
  const occurrences: SpecifierOccurrence[] = []
  const { length } = source
  let i = 0
  // Index where the current run of plain code text began — i.e. just past the last comment or
  // string this scan consumed, or 0 at the start.
  let codeStart = 0

  while (i < length) {
    const ch = source[i]

    if (ch === '/' && source[i + 1] === '/') {
      i += 2
      while (i < length && source[i] !== '\n') i++
      codeStart = i
      continue
    }

    if (ch === '/' && source[i + 1] === '*') {
      i += 2
      while (i < length && !(source[i] === '*' && source[i + 1] === '/')) i++
      i = Math.min(i + 2, length)
      codeStart = i
      continue
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      const isSpecifierQuote =
        (quote === "'" || quote === '"') && SPECIFIER_PREFIX.test(source.slice(codeStart, i))

      let j = i + 1
      while (j < length && source[j] !== quote) {
        j += source[j] === '\\' ? 2 : 1
      }
      const contentEnd = Math.min(j, length)
      const end = Math.min(contentEnd + 1, length)

      if (isSpecifierQuote) {
        occurrences.push({ specifier: source.slice(i + 1, contentEnd), start: i, end, quote })
      }

      i = end
      codeStart = i
      continue
    }

    i++
  }

  return occurrences
}

function isBare(specifier: string): boolean {
  return !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.includes('://')
}

export function rewriteBareSpecifiers(
  source: string,
  resolve: (specifier: string) => string | undefined,
): string | FlowUiLoadError {
  let unresolved: string | undefined
  let rewritten = ''
  let cursor = 0

  for (const occurrence of scanSpecifierOccurrences(source)) {
    if (!isBare(occurrence.specifier)) continue
    const url = resolve(occurrence.specifier)
    if (url === undefined) {
      unresolved ??= occurrence.specifier
      continue
    }
    rewritten += source.slice(cursor, occurrence.start)
    rewritten += `${occurrence.quote}${url}${occurrence.quote}`
    cursor = occurrence.end
  }
  rewritten += source.slice(cursor)

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
