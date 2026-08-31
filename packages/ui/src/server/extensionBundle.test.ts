import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { publicationFixture } from '../../../../examples/showcase/publication/fixtures.js'
import {
  buildExtensionBundle,
  clearExtensionBundleCache,
  extensionBundleBuildCount,
} from './extensionBundle.js'
import { cssTextOf } from './extensionCss.js'
import { serveFlowRegistry } from './httpServer.js'
import { jobikAllRoutes } from './runRoutes.js'
import { registryOf } from './runTestSupport.js'
import { pushCleanup, setupCleanups, temporaryFlow, uiPath } from './testSupport.js'
import { WIRE_MESSAGES } from './wireError.js'

setupCleanups()

/** Rolldown's first build in a process is the slow one; the shared 20 s project timeout is tight. */
const BUILD_TIMEOUT = 120_000

/**
 * A throwaway flow directory holding exactly the given files, returning the path of its
 * `flow.ui.tsx`. The directory is a fresh `mkdtemp` per call so no two builds share a memo key,
 * and it is removed by the shared cleanup drain.
 */
async function styledFlow(files: Readonly<Record<string, string | Uint8Array>>): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jobik-styled-ui-'))
  pushCleanup(() => fs.rm(directory, { recursive: true, force: true }))
  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(directory, name), content)
  }
  return path.join(directory, 'flow.ui.tsx')
}

describe('buildExtensionBundle', () => {
  it('bundles the flow-local extension with React and @jobik/ui left external', {
    timeout: BUILD_TIMEOUT,
  }, async () => {
    clearExtensionBundleCache()
    const code = await buildExtensionBundle({ uiPath })
    expect(code).not.toBeInstanceOf(Error)
    if (code instanceof Error) return

    // The flow's own modules are inlined...
    expect(code).toContain('RenderedImage')
    // ...and the two things the Studio already has stay bare imports.
    expect(code).toMatch(/from\s*["']@jobik\/ui["']/)
    expect(code).toMatch(/["']react\/jsx-runtime["']/)
    // Nothing about this machine crosses to the browser.
    expect(code.includes(publicationFixture.root)).toBe(false)
  })

  it('memoises a successful bundle so a second request does not rebuild', {
    timeout: BUILD_TIMEOUT,
  }, async () => {
    clearExtensionBundleCache()
    // Comparing the resolved strings would pass even with no cache at all — `Object.is` on two
    // equal strings is always true. Promise identity used to be the proof, but the memo now checks
    // that every module it was built from is still unchanged before it answers, and that check is
    // itself async — so the returned promise is a fresh one every time and the build counter is
    // what actually distinguishes a memo hit from a rebuild. See `extensionBundleFreshness.test.ts`.
    await buildExtensionBundle({ uiPath })
    expect(extensionBundleBuildCount()).toBe(1)
    await buildExtensionBundle({ uiPath })
    expect(extensionBundleBuildCount()).toBe(1)
  })

  it('returns the failure as a value when the entrypoint cannot be built', {
    timeout: BUILD_TIMEOUT,
  }, async () => {
    clearExtensionBundleCache()
    const missing = path.resolve(publicationFixture.root, 'no-such-flow-ui.tsx')
    expect(await buildExtensionBundle({ uiPath: missing })).toBeInstanceOf(Error)
  })
})

describe('GET /api/flows/:id/ui.js', () => {
  it('serves the bundle as JavaScript', { timeout: BUILD_TIMEOUT }, async () => {
    clearExtensionBundleCache()
    const flow = await temporaryFlow()
    const server = await serveFlowRegistry({
      registry: registryOf([flow]),
      host: '127.0.0.1',
      port: 0,
      routes: jobikAllRoutes,
    })
    pushCleanup(() => server.close())

    const response = await fetch(`${server.url}/api/flows/${flow.id}/ui.js`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/javascript')
    expect(await response.text()).toContain('RenderedImage')
  })

  it('answers a broken extension with a constant 500', { timeout: BUILD_TIMEOUT }, async () => {
    clearExtensionBundleCache()
    const flow = await temporaryFlow()
    const broken = { ...flow, uiPath: path.resolve(publicationFixture.root, 'no-such-flow-ui.tsx') }
    const server = await serveFlowRegistry({
      registry: registryOf([broken]),
      host: '127.0.0.1',
      port: 0,
      routes: jobikAllRoutes,
    })
    pushCleanup(() => server.close())

    const response = await fetch(`${server.url}/api/flows/${broken.id}/ui.js`)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: { _tag: null, message: WIRE_MESSAGES.internal },
    })
  })
})

/**
 * Real PNG bytes, spelled as the base64 that `extensionBundleSafety.test.ts` lifted from a
 * reproduction: it carries the `+` and the two later `/` separators that made a payload match the
 * disclosure guard's UNC rule. Written this way so an inlined image fixture is deterministically
 * dangerous — a shortened blob would silently exercise nothing.
 */
const COLLIDING_PNG_BASE64 =
  'iVBORw0KGgoAAAA+//NvKRfef/UFSQSZ73fPWVy4U3lequMUDuixIY8TSUPP04rM19GeMA/1wd9PAAAA=='

/** The smallest entry that imports a stylesheet: no bare specifiers, so it evaluates under Node. */
const STYLED_ENTRY = 'import "./flow.css"\nexport default { render: () => null }\n'

type StubElement = {
  readonly tagName: string
  textContent: string
  setAttribute(name: string, value: string): void
  getAttribute(name: string): string | null
}

/**
 * The smallest `document` the injected prelude actually touches. These tests run in the `core`
 * project, which is `environment: 'node'` — there is no DOM here and jsdom is the other project's.
 * `querySelector` understands exactly one selector shape, `tag[attribute="value"]`, and throws on
 * anything else so a change of shape shows up as a loud failure rather than a silent `null`.
 */
function stubDocument(): { styles: () => readonly StubElement[]; restore: () => void } {
  const children: StubElement[] = []
  const createElement = (tagName: string): StubElement => {
    const attributes = new Map<string, string>()
    return {
      tagName,
      textContent: '',
      setAttribute: (name, value) => void attributes.set(name, value),
      getAttribute: (name) => attributes.get(name) ?? null,
    }
  }
  const document = {
    createElement,
    head: { appendChild: (child: StubElement) => void children.push(child) },
    querySelector: (selector: string): StubElement | null => {
      const parsed = /^([\w-]+)\[([\w-]+)="(.*)"\]$/.exec(selector)
      if (parsed === null) throw new Error(`the document stub cannot parse '${selector}'`)
      const found = children.find(
        (child) => child.tagName === parsed[1] && child.getAttribute(parsed[2]) === parsed[3],
      )
      return found ?? null
    },
  }
  const globals = globalThis as Record<string, unknown>
  const had = Object.hasOwn(globals, 'document')
  const previous = globals.document
  globals.document = document
  return {
    styles: () => children.filter((child) => child.tagName === 'style'),
    restore: () => {
      if (had) globals.document = previous
      else delete globals.document
    },
  }
}

/**
 * Evaluate a built bundle the way the browser does — as a module, once.
 *
 * Node keys its module cache by URL, so `salt` is what makes a second evaluation of the same
 * bundle a genuinely second module instance. That is not an artifice: `loadFlowUi` hands every
 * load a fresh `blob:`/`data:` URL, so two loads in one page are two instances there too.
 */
async function evaluateModule(code: string, salt = ''): Promise<void> {
  const source = salt === '' ? code : `${code}\n//${salt}\n`
  await import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(source)}`)
}

describe('cssTextOf', () => {
  it('returns the stylesheet text with vite’s marker stripped', () => {
    expect(cssTextOf('.jobik-probe { color: red }\n/*$vite$:1*/')).toBe(
      '.jobik-probe { color: red }\n',
    )
  })

  it('refuses a source that is not text', () => {
    // Rollup types `asset.source` as `string | Uint8Array`, and `String(bytes)` is
    // `'46,111,111'` — comma-joined byte numbers, which would be injected into the page as a
    // stylesheet with nothing raised anywhere. That is the same silent-garbage failure this whole
    // change exists to remove, so this branch refuses rather than guessing.
    const bytes = new TextEncoder().encode('.jobik-probe { color: red }')
    expect(cssTextOf(bytes)).toBeInstanceOf(Error)
  })
})

/**
 * A `flow.ui.tsx` may `import './flow.css'`. Vite emits the stylesheet as a separate
 * `type: 'asset'` output item rather than as part of the entry chunk, and the entry chunk carries
 * no reference to it at all — so serving only the chunk threw the author's styles away silently.
 */
describe('a flow-local stylesheet', () => {
  it('reaches the served module', { timeout: BUILD_TIMEOUT }, async () => {
    const styled = await styledFlow({
      'flow.css': '.jobik-probe { color: rgb(1, 2, 3) }\n',
      'flow.ui.tsx': STYLED_ENTRY,
    })

    clearExtensionBundleCache()
    const code = await buildExtensionBundle({ uiPath: styled })
    expect(code).not.toBeInstanceOf(Error)
    if (code instanceof Error) return
    expect(code).toContain('.jobik-probe')
    expect(code).toContain('rgb(1, 2, 3)')
  })

  it('does not carry vite’s own marker comment into the served module', {
    timeout: BUILD_TIMEOUT,
  }, async () => {
    // Vite appends a 12-byte `/*$vite$:1*/` tail to the emitted stylesheet, and the hook that
    // would strip it again does not run in this config — so it survives into `asset.source`.
    // It is vite bookkeeping, not the author's CSS, and has no business in the browser.
    const styled = await styledFlow({
      'flow.css': '.jobik-probe { color: rgb(1, 2, 3) }\n',
      'flow.ui.tsx': STYLED_ENTRY,
    })

    clearExtensionBundleCache()
    const code = await buildExtensionBundle({ uiPath: styled })
    expect(code).not.toBeInstanceOf(Error)
    if (code instanceof Error) return
    expect(code).toContain('.jobik-probe')
    expect(code).not.toMatch(/\$vite\$/)
  })

  it('appends one identifiable style element when the module is evaluated', {
    timeout: BUILD_TIMEOUT,
  }, async () => {
    const styled = await styledFlow({
      'flow.css': '.jobik-probe { color: rgb(1, 2, 3) }\n',
      'flow.ui.tsx': STYLED_ENTRY,
    })

    clearExtensionBundleCache()
    const code = await buildExtensionBundle({ uiPath: styled })
    expect(code).not.toBeInstanceOf(Error)
    if (code instanceof Error) return

    const dom = stubDocument()
    pushCleanup(dom.restore)
    await evaluateModule(code)

    expect(dom.styles()).toHaveLength(1)
    expect(dom.styles()[0].textContent).toContain('.jobik-probe')
    // Identifiable, so the page can find what the extension put there.
    expect(dom.styles()[0].getAttribute('data-jobik-flow-ui-style')).not.toBeNull()
  })

  it('does not stack a second style element when the same bundle is evaluated again', {
    timeout: BUILD_TIMEOUT,
  }, async () => {
    // `useStudioSession` reloads the extension whenever `flowId` changes, and `loadFlowUi` mints a
    // fresh module URL for every load — so switching flow away and back, or React's StrictMode
    // double-invoking that effect, evaluates the same bundle more than once in one page.
    const styled = await styledFlow({
      'flow.css': '.jobik-probe { color: rgb(1, 2, 3) }\n',
      'flow.ui.tsx': STYLED_ENTRY,
    })

    clearExtensionBundleCache()
    const code = await buildExtensionBundle({ uiPath: styled })
    expect(code).not.toBeInstanceOf(Error)
    if (code instanceof Error) return

    const dom = stubDocument()
    pushCleanup(dom.restore)
    await evaluateModule(code, 'first')
    await evaluateModule(code, 'second')

    expect(dom.styles()).toHaveLength(1)
  })

  it('still injects a second flow’s stylesheet into the same page', {
    timeout: BUILD_TIMEOUT,
  }, async () => {
    // The sidebar switches flows without a reload, so two extensions share one `document`. A guard
    // that keyed on nothing but "some jobik style exists" would silently drop the second one —
    // which is the very failure this whole change is about.
    const one = await styledFlow({
      'flow.css': '.jobik-one { color: rgb(1, 2, 3) }\n',
      'flow.ui.tsx': STYLED_ENTRY,
    })
    const two = await styledFlow({
      'flow.css': '.jobik-two { color: rgb(4, 5, 6) }\n',
      'flow.ui.tsx': STYLED_ENTRY,
    })

    clearExtensionBundleCache()
    const first = await buildExtensionBundle({ uiPath: one })
    const second = await buildExtensionBundle({ uiPath: two })
    expect(first).not.toBeInstanceOf(Error)
    expect(second).not.toBeInstanceOf(Error)
    if (first instanceof Error || second instanceof Error) return

    const dom = stubDocument()
    pushCleanup(dom.restore)
    await evaluateModule(first)
    await evaluateModule(second)

    expect(
      dom
        .styles()
        .map((style) => style.textContent)
        .join(''),
    ).toContain('.jobik-one')
    expect(
      dom
        .styles()
        .map((style) => style.textContent)
        .join(''),
    ).toContain('.jobik-two')
  })

  it('is refused when it discloses a filesystem path', { timeout: BUILD_TIMEOUT }, async () => {
    // The stylesheet is a second body crossing to the browser on the same route, so it gets the
    // same wall as the chunk. Without this, the disclosure guard would sweep the JavaScript and
    // wave the CSS straight past it.
    const styled = await styledFlow({
      'flow.css': '.jobik-probe::after { content: "C:/Users/someone/flows/publication.tsx" }\n',
      'flow.ui.tsx': STYLED_ENTRY,
    })

    clearExtensionBundleCache()
    const built = await buildExtensionBundle({ uiPath: styled })
    expect(built).toBeInstanceOf(Error)
    if (!(built instanceof Error)) return
    expect(built.message).toMatch(/discloses/)
  })

  it('is refused when it references an asset nothing serves', {
    timeout: BUILD_TIMEOUT,
  }, async () => {
    // `build.lib` makes vite inline every local asset as a `data:` URI whatever its size, so the
    // ordinary case needs no asset route. `?no-inline` is the one escape hatch that still wins,
    // and it emits a hashed file this route has no way to serve — the author would get a broken
    // background and, again, nothing on the server. Refuse loudly instead.
    const styled = await styledFlow({
      'bg.png': Buffer.from(COLLIDING_PNG_BASE64, 'base64'),
      'flow.css': '.jobik-probe { background: url("./bg.png?no-inline") }\n',
      'flow.ui.tsx': STYLED_ENTRY,
    })

    clearExtensionBundleCache()
    const built = await buildExtensionBundle({ uiPath: styled })
    expect(built).toBeInstanceOf(Error)
    if (!(built instanceof Error)) return
    // Named, so the author knows which file to stop excluding from inlining.
    expect(built.message).toMatch(/bg[\w-]*\.png/)
  })

  it('carries an image the stylesheet references, inlined', {
    timeout: BUILD_TIMEOUT,
  }, async () => {
    // The boundary of the refusal above: under `build.lib` an ordinary `url('./bg.png')` is
    // inlined and emits no second asset, so it must be served, not refused. The payload is the
    // known colliding one, which also puts the CSS sweep on the exact input that made the
    // disclosure guard mistake a base64 blob for a UNC path.
    const styled = await styledFlow({
      'bg.png': Buffer.from(COLLIDING_PNG_BASE64, 'base64'),
      'flow.css': '.jobik-probe { background: url("./bg.png") }\n',
      'flow.ui.tsx': STYLED_ENTRY,
    })

    clearExtensionBundleCache()
    const code = await buildExtensionBundle({ uiPath: styled })
    expect(code).not.toBeInstanceOf(Error)
    if (code instanceof Error) return
    // The fixture is only dangerous if the payload survived the round trip intact — `+` followed
    // by two later `/` separators is what the UNC rule needs. Vite emits the payload unpadded.
    const payload = COLLIDING_PNG_BASE64.replace(/=+$/, '')
    expect(payload).toMatch(/\+\/\/[^/]+\/[^/]+\//)
    expect(code).toContain(`data:image/png;base64,${payload}`)
  })

  it('is rebuilt when only the stylesheet changed on disk', {
    timeout: BUILD_TIMEOUT,
  }, async () => {
    // The memo stamps every id in `chunk.moduleIds`, plus the entry. If a stylesheet's id is not
    // among them, editing only the `.css` file changes no stamp and the server answers the old
    // bundle forever — the route's `cache-control: no-store` made a liar of, for CSS only.
    const styled = await styledFlow({
      'flow.css': '.jobik-before { color: rgb(1, 2, 3) }\n',
      'flow.ui.tsx': STYLED_ENTRY,
    })

    clearExtensionBundleCache()
    const first = await buildExtensionBundle({ uiPath: styled })
    expect(first).not.toBeInstanceOf(Error)
    expect(first).toContain('.jobik-before')
    expect(extensionBundleBuildCount()).toBe(1)

    await fs.writeFile(
      path.join(path.dirname(styled), 'flow.css'),
      '.jobik-after { color: rgb(9, 9, 9) }\n',
    )

    const second = await buildExtensionBundle({ uiPath: styled })
    expect(extensionBundleBuildCount()).toBe(2)
    expect(second).toContain('.jobik-after')
  })
})
