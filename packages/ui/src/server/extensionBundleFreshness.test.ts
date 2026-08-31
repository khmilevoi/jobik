import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildExtensionBundle,
  clearExtensionBundleCache,
  extensionBundleBuildCount,
} from './extensionBundle.js'
import { pushCleanup, setupCleanups } from './testSupport.js'

setupCleanups()

/**
 * The memo behind `GET /api/flows/:id/ui.js`, and the header it has to keep.
 *
 * That route answers `cache-control: no-store` — a promise to the browser that every request gets
 * a fresh answer. The memo used to key on `uiPath` alone and hold a successful bundle for the life
 * of the process, so editing `flow.ui.tsx` needed a server restart and the header was a lie.
 *
 * `flow.ui.tsx` is not the only input: it imports its own `components/`, and the publication
 * example does exactly that. So the key is every module the build REPORTED inlining, not the entry
 * alone — the second test here is the one that distinguishes the two.
 *
 * This is a cache key, not a dev server: there is no watcher, nothing rebuilds until a request
 * asks for the bundle, and a request that arrives while nothing has changed still pays no build.
 */

/** Rolldown's first build in a process is the slow one; the shared 20 s project timeout is tight. */
const BUILD_TIMEOUT = 120_000

/** A throwaway flow whose entry imports one component module, so the graph has two files. */
async function flowWithComponent(caption: string): Promise<{ entry: string; component: string }> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jobik-ui-freshness-'))
  pushCleanup(() => fs.rm(directory, { recursive: true, force: true }))
  const component = path.join(directory, 'caption.ts')
  await fs.writeFile(component, `export function caption() { return ${caption} }\n`, 'utf8')
  const entry = path.join(directory, 'flow.ui.tsx')
  await fs.writeFile(
    entry,
    [
      "import { caption } from './caption.js'",
      'export default { render: () => caption() }',
      '',
    ].join('\n'),
    'utf8',
  )
  return { entry, component }
}

async function buildCode(uiPath: string): Promise<string> {
  const result = await buildExtensionBundle({ uiPath })
  if (result instanceof Error) throw result
  return result
}

describe('the ui.js memo', () => {
  it('does not rebuild when nothing on disk changed', { timeout: BUILD_TIMEOUT }, async () => {
    const { entry } = await flowWithComponent('"first"')
    clearExtensionBundleCache()

    const first = await buildCode(entry)
    const afterFirst = extensionBundleBuildCount()
    expect(afterFirst).toBe(1)

    // Ten more requests, nothing touched. Comparing the strings would pass with no cache at all,
    // so the build counter is what actually proves the memo held.
    for (let index = 0; index < 10; index += 1) expect(await buildCode(entry)).toBe(first)
    expect(extensionBundleBuildCount()).toBe(afterFirst)
  })

  it('rebuilds when a module the entry imports changes, not only the entry', {
    timeout: BUILD_TIMEOUT,
  }, async () => {
    const { entry, component } = await flowWithComponent('"before"')
    clearExtensionBundleCache()

    expect(await buildCode(entry)).toContain('before')
    const afterFirst = extensionBundleBuildCount()

    // The entry is untouched. Only the component it imports changes — the case an `mtimeMs` on
    // `flow.ui.tsx` alone would miss, and the reason the key is the whole reported module set.
    await fs.writeFile(component, 'export function caption() { return "after" }\n', 'utf8')

    const second = await buildCode(entry)
    expect(second).toContain('after')
    expect(second).not.toContain('before')
    expect(extensionBundleBuildCount()).toBe(afterFirst + 1)
  })

  it('rebuilds when the entry itself changes', { timeout: BUILD_TIMEOUT }, async () => {
    const { entry } = await flowWithComponent('"held"')
    clearExtensionBundleCache()

    expect(await buildCode(entry)).toContain('held')
    const afterFirst = extensionBundleBuildCount()

    await fs.writeFile(
      entry,
      [
        "import { caption } from './caption.js'",
        'export const marker = caption() + "edited"',
        '',
      ].join('\n'),
      'utf8',
    )

    expect(await buildCode(entry)).toContain('edited')
    expect(extensionBundleBuildCount()).toBe(afterFirst + 1)
  })

  it('rebuilds after a module is deleted, and reports the failure', {
    timeout: BUILD_TIMEOUT,
  }, async () => {
    const { entry, component } = await flowWithComponent('"present"')
    clearExtensionBundleCache()

    expect(await buildCode(entry)).toContain('present')
    await fs.rm(component)

    expect(await buildExtensionBundle({ uiPath: entry })).toBeInstanceOf(Error)
  })
})
