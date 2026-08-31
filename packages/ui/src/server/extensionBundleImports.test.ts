import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { buildExtensionBundle, clearExtensionBundleCache } from './extensionBundle.js'
import { pushCleanup, setupCleanups, uiPath } from './testSupport.js'

setupCleanups()

/**
 * What happens to an import nothing resolves.
 *
 * An unresolved import does not fail a rolldown build: it becomes an external and stays in the
 * bundle as a bare specifier the browser then cannot load — a blank slot in the output viewer and
 * nothing at all on the server, which is what P14 found.
 *
 * The first block pins behaviour this module gets for free and must not lose. On vite 8.2.2
 * `logLevel: 'silent'` does NOT suppress `UNRESOLVED_IMPORT`: vite's default log handler throws on
 * that code before any log level is consulted, so a mistyped import already lands in
 * `bundleExtension`'s `catch`. That is incidental — it holds only while no `onwarn` or `onLog` of
 * our own displaces vite's handler — so it is pinned here rather than relied on silently.
 *
 * The last block is the residual the warning never covered, and the reason `unprovidedImports`
 * exists: a specifier rolldown never tries to resolve, warns nothing about, and leaves in the
 * bundle. The only bare specifiers this bundle may leave for the browser are the four the Studio
 * page already provides; anything else is refused and named.
 */

/** Rolldown's first build in a process is the slow one; the shared 20 s project timeout is tight. */
const BUILD_TIMEOUT = 120_000

/** A throwaway flow directory whose `flow.ui.tsx` is written by the caller. */
async function flowUiOf(lines: readonly string[]): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jobik-ui-imports-'))
  pushCleanup(() => fs.rm(directory, { recursive: true, force: true }))
  const entry = path.join(directory, 'flow.ui.tsx')
  await fs.writeFile(entry, `${lines.join('\n')}\n`, 'utf8')
  return entry
}

describe('an import the bundler cannot resolve', () => {
  it('fails the build instead of becoming a silent external', {
    timeout: BUILD_TIMEOUT,
  }, async () => {
    const entry = await flowUiOf([
      "import { helper } from 'not-a-real-package'",
      'export default { render: () => helper() }',
    ])
    clearExtensionBundleCache()
    const result = await buildExtensionBundle({ uiPath: entry })
    expect(result).toBeInstanceOf(Error)
  })

  it('names the specifier on the server console', { timeout: BUILD_TIMEOUT }, async () => {
    const entry = await flowUiOf([
      "import { helper } from '@not-a-real/scope'",
      'export default { render: () => helper() }',
    ])
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    pushCleanup(() => logged.mockRestore())

    clearExtensionBundleCache()
    expect(await buildExtensionBundle({ uiPath: entry })).toBeInstanceOf(Error)

    const text = logged.mock.calls
      .map((call) => call.map((part) => String(part)).join(' '))
      .join('\n')
    expect(text).toContain('@not-a-real/scope')
  })

  it('catches a mistyped relative import too', { timeout: BUILD_TIMEOUT }, async () => {
    const entry = await flowUiOf([
      "import { caption } from './captoin.js'",
      'export default { render: () => caption() }',
    ])
    clearExtensionBundleCache()
    expect(await buildExtensionBundle({ uiPath: entry })).toBeInstanceOf(Error)
  })
})

describe('the specifiers the Studio page already provides still build', () => {
  it('leaves react and @jobik/ui external without complaint', {
    timeout: BUILD_TIMEOUT,
  }, async () => {
    const entry = await flowUiOf([
      "import { useState } from 'react'",
      "import { createRoot } from 'react-dom/client'",
      "import { defineFlowUi } from '@jobik/ui'",
      'export default defineFlowUi({',
      '  render: () => [useState, createRoot],',
      '})',
    ])
    clearExtensionBundleCache()
    const result = await buildExtensionBundle({ uiPath: entry })
    expect(result).not.toBeInstanceOf(Error)
    if (result instanceof Error) return
    expect(result).toMatch(/from\s*["']react["']/)
    expect(result).toMatch(/from\s*["']react-dom\/client["']/)
    expect(result).toMatch(/from\s*["']@jobik\/ui["']/)
  })

  it('still inlines what vite shims for the browser', { timeout: BUILD_TIMEOUT }, async () => {
    // `node:fs` is NOT an unresolved import: vite replaces it with its own throwing browser stub
    // and inlines that, so nothing is left external and the build is legitimately a success. The
    // author finds out at runtime, from vite's own message. That is vite's documented behaviour
    // and not this module's to override.
    const entry = await flowUiOf([
      "import { readFileSync } from 'node:fs'",
      'export default { render: () => readFileSync }',
    ])
    clearExtensionBundleCache()
    const result = await buildExtensionBundle({ uiPath: entry })
    expect(result).not.toBeInstanceOf(Error)
    if (result instanceof Error) return
    expect(result).toContain('externalized for browser compatibility')
    expect(result).not.toMatch(/from\s*["']node:fs["']/)
  })

  it('still builds the example flow, whose graph is real', {
    timeout: BUILD_TIMEOUT,
  }, async () => {
    clearExtensionBundleCache()
    expect(await buildExtensionBundle({ uiPath })).not.toBeInstanceOf(Error)
  })
})

describe('an import left external with no warning at all', () => {
  it('refuses a bundle that would pull code from a remote origin', {
    timeout: BUILD_TIMEOUT,
  }, async () => {
    // The residual case, and the one `UNRESOLVED_IMPORT` never covered: rolldown does not try to
    // resolve a URL specifier, does not warn about it, and leaves it in the bundle verbatim. The
    // body was a clean 200, and the Studio's own page then fetched and executed
    // `https://cdn.example.com/widget.js` on the Studio's origin — the same origin that serves
    // `POST /api/flows/:id/save`.
    const entry = await flowUiOf([
      "import { widget } from 'https://cdn.example.com/widget.js'",
      'export default { render: () => widget }',
    ])
    clearExtensionBundleCache()
    const result = await buildExtensionBundle({ uiPath: entry })
    expect(result).toBeInstanceOf(Error)
    if (!(result instanceof Error)) return
    expect(result.message).toContain('https://cdn.example.com/widget.js')
  })

  it('names every unprovided specifier, not just the first', {
    timeout: BUILD_TIMEOUT,
  }, async () => {
    const entry = await flowUiOf([
      "import { a } from 'https://cdn.example.com/a.js'",
      "import { b } from 'https://cdn.example.com/b.js'",
      'export default { render: () => [a, b] }',
    ])
    clearExtensionBundleCache()
    const result = await buildExtensionBundle({ uiPath: entry })
    expect(result).toBeInstanceOf(Error)
    if (!(result instanceof Error)) return
    expect(result.message).toContain('a.js')
    expect(result.message).toContain('b.js')
  })
})
