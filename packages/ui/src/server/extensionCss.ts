/**
 * The stylesheet half of the flow-UI extension build.
 *
 * `flow.ui.tsx` may `import './flow.css'`. Vite emits that stylesheet as a separate
 * `type: 'asset'` output item and puts no reference to it in the entry chunk, so a server that
 * serves the chunk alone throws the author's styles away with nothing said anywhere. Reading that
 * asset back into text is this module's whole job; `extensionBundle.ts` does the rest.
 *
 * Deliberately NOT exported from the package barrel — an internal check, like `bundleSafety.ts`
 * and `wireSafety.ts`. A consumer of `@jobik/ui/server` has no use for it: it is a detail of one
 * build step, and `index.ts` is append-only, so anything that reaches it is hard to take back.
 */

/**
 * Vite's own bookkeeping tail on an emitted stylesheet — `/*$vite$:1*` + `/`. The hook that strips
 * it again does not run in this config, so it arrives in `asset.source` and would otherwise be
 * served to the browser as if the author had written it.
 */
const VITE_CSS_MARKER = /\/\*\$vite\$:\d+\*\/\s*$/

/**
 * The stylesheet an emitted asset holds, with vite's bookkeeping tail removed.
 *
 * Rollup types `source` as `string | Uint8Array`, and today's vite hands this one a string. The
 * other branch is not hypothetical enough to coerce through: `String(bytes)` is `'46,111,111'` —
 * the byte values comma-joined — and that would be injected into the page as the author's
 * stylesheet with nothing raised anywhere, which is the exact failure class this whole guard chain
 * exists to remove. Decoding the bytes instead would be a guess at an encoding on a path no build
 * takes; refusing is what the caller can act on.
 */
export function cssTextOf(source: unknown): string | Error {
  if (typeof source !== 'string') {
    return new Error(
      `the stylesheet asset is ${source === null ? 'null' : typeof source} rather than text`,
    )
  }
  return source.replace(VITE_CSS_MARKER, '')
}
