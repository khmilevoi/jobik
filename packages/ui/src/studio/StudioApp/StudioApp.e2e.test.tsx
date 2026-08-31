import { readFile, writeFile } from 'node:fs/promises'
import type { FlowDocument } from '@jobik/core'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import * as React from 'react'
import * as ReactJsxRuntime from 'react/jsx-runtime'
import * as ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobikClient } from '#client/index.js'
import { createJobikClient } from '#client/index.js'
import * as jobikUi from '#index.js'
import type { JobikServer } from '#server/httpServer.js'
import { serveFlowRegistry } from '#server/httpServer.js'
import { jobikAllRoutes } from '#server/runRoutes.js'
import { registryOf } from '#server/runTestSupport.js'
import { pushCleanup, setupCleanups, temporaryFlow } from '#server/testSupport.js'
import {
  publicationExpectedUrlPattern,
  publicationSampleInput,
} from '../../../../../examples/publication/fixtures.js'
import { StudioApp } from './StudioApp.js'

/**
 * The end-to-end Studio test: a real `serveFlowRegistry` HTTP server, bound to a throwaway copy of
 * the `publication` example's document, driving a real `StudioApp` over `createJobikClient`. Every
 * request in this file crosses a real loopback socket — nothing here mocks `fetch` or the client.
 *
 * Ruling R8 (task 13): two of the plan's draft tests asserted nothing —
 * `'marks the draft dirty on an edit'` clicked Save without ever editing anything, and
 * `'validates the loaded draft'` waited on an element already present and checked the absence of
 * the wrong chip. Both are fixed below: the dirty test drives a REAL edit (a simulated React Flow
 * node drag, through the exact `mousedown`/`mousemove`/`mouseup` cycle `d3-drag` — which `FlowCanvas`
 * uses under `onNodeDragStop` — listens for) and asserts the persisted position; the validate test
 * counts the `POST /api/flows/:id/validate` request against the real server and asserts it carried
 * the draft's document.
 *
 * ENVIRONMENT FINDING, not a server or core defect: vitest's `jsdom` environment copies
 * `dom.window.Uint8Array` (jsdom's OWN realm's typed array class) onto `globalThis`, the same
 * `globalThis` this file's real `@jobik/core` flow execution runs on. `packages/core/src/asset.ts`'s
 * `asset()` schema validates a binary output field with `value instanceof Uint8Array`, resolved
 * against WHATEVER `Uint8Array` is on `globalThis` at call time — jsdom's, not Node's. A real
 * `Buffer` (`render`'s `image` output field) is never an instance of jsdom's `Uint8Array`, so every
 * asset-producing node fails with a `NodeExecutionError` wrapping a `ZodError`
 * (`"Expected binary data (image/png)"`) the instant a real run reaches it — reproduced directly
 * against `@jobik/core`'s own `BoundFlow.run()`, with no HTTP, no React and no jsdom DOM APIs
 * involved, to confirm this is a `globalThis` fact and not a bug in this plan's own code.
 * `Buffer.prototype`'s own prototype chain was fixed at Node startup, before jsdom ran, so
 * `Object.getPrototypeOf(Buffer.prototype).constructor` recovers the real, unclobbered `Uint8Array`
 * regardless — this restores it onto `globalThis` for the one file that needs both a real DOM (to
 * render `StudioApp`) and a real `@jobik/core` execution (to run a real asset-producing flow). A
 * whole-file environment override was tried and rejected: Vitest's per-file environment docblock
 * comment (documented at https://vitest.dev/config/#environment, keyed on a `vitest` + hyphen +
 * `environment` control comment matched anywhere in a file's text, not just as an actual directive)
 * would drop this file to a `node` environment and remove `document`/`window`, breaking every
 * `render()` call below — note the deliberate spacing in this very sentence so this paragraph
 * itself is not mistaken for that directive. `vitest.config.ts` and the root `vitest.setup.ts` are
 * shared surfaces this plan does not touch, so the fix stays file-scoped, applied below.
 */
const RealUint8Array = Object.getPrototypeOf(Buffer.prototype).constructor as typeof Uint8Array
if (globalThis.Uint8Array !== RealUint8Array) {
  Object.defineProperty(globalThis, 'Uint8Array', {
    value: RealUint8Array,
    configurable: true,
    writable: true,
  })
}

setupCleanups()
afterEach(cleanup)

let server: JobikServer
let documentPath: string
let client: JobikClient

beforeEach(async () => {
  const flow = await temporaryFlow()
  documentPath = flow.documentPath
  // `serveFlowRegistry`'s own `routes` defaults to the four non-run routes (`jobikFlowRoutes`);
  // `jobikAllRoutes` (`runRoutes.ts`) is the sanctioned way to reach run, cancel, asset and
  // extension-bundle routes too — the same one `runRoutes.test.ts` uses to stand up a full server.
  server = await serveFlowRegistry({
    registry: registryOf([flow]),
    host: '127.0.0.1',
    port: 0,
    routes: jobikAllRoutes,
  })
  pushCleanup(() => server.close())

  const real = createJobikClient({ baseUrl: server.url })
  // Point the extension bundle at a flow the server does not know: a 404 answers at once, where the
  // real route invokes Vite. One test below overrides this back to the real URL.
  client = { ...real, extensionBundleUrl: () => `${server.url}/api/flows/unknown/ui.js` }
})

function mount(overrides: Partial<JobikClient> = {}) {
  return render(
    <StudioApp
      client={{ ...client, ...overrides }}
      externals={{}}
      importModule={async () => ({})}
    />,
  )
}

/**
 * Drives one real React Flow node drag through the DOM events `d3-drag` (via `@xyflow/system`'s
 * `XYDrag`) actually listens for. `FlowCanvas` never touches pointer events for node dragging — it
 * hands the whole node off to `d3-drag`, which binds `mousedown`/`mousemove`/`mouseup` and reads
 * `event.view` to find the window it should track the rest of the gesture on. jsdom's `MouseEvent`
 * constructor rejects a `view` that is not exactly its own `Window`-branded object even when given
 * `window` itself, so it is patched onto the constructed event afterwards instead.
 *
 * `d3-drag`'s own gesture only "starts" once one move exceeds its drag threshold; that FIRST move
 * establishes the gesture's own baseline pointer position, and only a SUBSEQUENT move's delta from
 * that baseline reaches `onNodeDragStop`. The first move below is therefore a small, disposable
 * threshold-crosser, and `dx`/`dy` are the delta applied by the second — confirmed empirically
 * against this exact drag stack before being written into this test.
 */
function dragNode(container: HTMLElement, nodeId: string, dx: number, dy: number): void {
  const nodeEl = container.querySelector(`.react-flow__node[data-id="${nodeId}"]`)
  if (nodeEl === null) throw new Error(`dragNode: no rendered React Flow node for "${nodeId}"`)

  const dispatch = (target: EventTarget, type: string, clientX: number, clientY: number) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      button: 0,
    })
    Object.defineProperty(event, 'view', { value: window, configurable: true })
    target.dispatchEvent(event)
  }

  const startX = 200
  const startY = 200
  dispatch(nodeEl, 'mousedown', startX, startY)
  dispatch(window, 'mousemove', startX + 3, startY + 3)
  dispatch(window, 'mousemove', startX + 3 + dx, startY + 3 + dy)
  dispatch(window, 'mouseup', startX + 3 + dx, startY + 3 + dy)
}

describe('the Studio over the publication example', () => {
  it('loads the flow from the server and draws it', async () => {
    mount()

    await waitFor(() =>
      expect(screen.getByTestId('studio-flow-row-publication')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('studio-top-bar').textContent).toContain('publication')
    expect(screen.getByTestId('studio-top-bar').textContent).toContain('flow.jobik.json')

    await waitFor(() => expect(screen.getByTestId('node-card-start1')).toBeInTheDocument())
    expect(screen.getByTestId('node-card-render')).toBeInTheDocument()
    expect(screen.getByTestId('node-card-publish')).toBeInTheDocument()
    expect(screen.queryByTestId('studio-dirty')).toBeNull()
  })

  it('derives the run inputs from the start schema', async () => {
    mount()

    await waitFor(() => expect(screen.getByTestId('run-input-title')).toBeInTheDocument())
    expect(screen.getByTestId('run-input-markdown')).toBeInTheDocument()
    expect(screen.getByTestId('run-input-annotation-title').textContent).toBe('string')
  })

  it('runs the flow, streams it, and shows the completed panel with the run number and outputs', {
    timeout: 60_000,
  }, async () => {
    mount()

    await waitFor(() => expect(screen.getByTestId('run-input-title')).toBeInTheDocument())
    await userEvent.type(screen.getByTestId('run-input-title'), publicationSampleInput.title)
    await userEvent.type(screen.getByTestId('run-input-markdown'), publicationSampleInput.markdown)
    await userEvent.click(screen.getByTestId('run-start-button'))

    await waitFor(() => expect(screen.getByTestId('run-outputs-label')).toBeInTheDocument(), {
      timeout: 30_000,
    })

    // `render` produced a binary field; `publish` produced a URL. Ruling R1: an asset output
    // field is one field, so the unqualified name `image` is correct, not `render.image`.
    expect(screen.getByTestId('run-output-name-image')).toBeInTheDocument()
    expect(screen.getByTestId('run-output-well-url').textContent).toMatch(
      publicationExpectedUrlPattern,
    )
    // Every node settled ok.
    expect(screen.getByTestId('run-timing-value-publish').textContent).toMatch(/s$/)

    // `### Run identity` (closeout finding 8-A, now closed): the dock header carries the run
    // number the server really issued — `#N · 2.4s` once settled (design 838) — and the chevron
    // that occupies that slot while idle is gone. This is the run number over a real run, not a
    // fixture: nothing in this file chooses `N`.
    const meta = screen.getByTestId('studio-dock-run-meta').textContent ?? ''
    expect(meta).toMatch(/^#\d+ · \d+\.\d+s$/)
    expect(screen.queryByLabelText('Collapse run panel')).toBeNull()
    // Still exactly one header in the dock: `RunPanel` returns a fragment and draws none.
    expect(screen.queryByTestId('run-state-header')).toBeNull()

    // Closeout finding 1, ok: the settled `render` card's inline slot caption is the mono metadata
    // row built from the real `AssetDescriptor` the server sent — its mime and its byte count, and
    // never the artboard's `1024×1024`, which no descriptor carries.
    //
    // `waitFor`, not a bare read — and NOT for the reason this comment used to give. The hook's
    // own tear (`lastReport` and `session` as two `useState` values settled by two setter calls)
    // is gone: `useStudioSession` derives the report from the session, so the dock and the node
    // overlays now settle in one commit, and `useStudioSession.test.ts` asserts that per commit.
    // What survives is downstream and outside this fix: `FlowCanvas` mirrors its `nodes` prop into
    // its own `useState` from a `useEffect` (`canvas/FlowCanvas.tsx`), so the canvas DOM is one
    // commit behind the run panel, which renders from props directly. Removing this wait fails
    // here with the `render` card still drawn as `node-state-queued`. Left in deliberately.
    const caption = await waitFor(() =>
      within(screen.getByTestId('node-card-render')).getByTestId('node-output-caption'),
    )
    expect(caption.textContent).toMatch(/^png · \d+ kb/)
    expect(caption.textContent).not.toContain('×')
    // The caption row's right cell is the producing node DEFINITION's own name (design 206 reads
    // `imageOut`, the same string that artboard's `Inventory` lists). On the wire that is
    // `SafeNodeDescriptorPayload.title` — the one field `toInventory` also reads — so here it is
    // the example's own `imageOut.title`, not the artboard's fixture spelling of it.
    expect(
      within(screen.getByTestId('node-card-render')).getByTestId('node-output-source'),
    ).toHaveTextContent('Render image')

    // `StudioApp` also hands the whole `WireRunReportPayload` — `runNumber` included — to
    // `OutputViewer`'s `Raw` tab. `Open`ing the asset field's viewer and switching to `Raw` proves
    // the viewer tabs `## Verification` asks for, over the one route `StudioApp` actually built.
    await userEvent.click(screen.getByTestId('run-output-open-image'))
    await waitFor(() => expect(screen.getByTestId('output-viewer')).toBeInTheDocument())
    await userEvent.click(screen.getByText('Raw'))
    await waitFor(() =>
      expect(screen.getByTestId('output-viewer-panel').textContent).toMatch(/"runNumber":\s*\d+/),
    )
  })

  it('renders the flow-local Output component in the node card once the run completes', {
    timeout: 120_000,
  }, async () => {
    /**
     * R34 (fix round 1): the plan's `## Verification` names "custom output slots" as something
     * this file must demonstrate, but no test before this one ever mounted `StudioApp` against a
     * loaded extension — `'serves a real flow-local extension bundle over HTTP'` below only ever
     * fetched the raw bytes. This test mounts `StudioApp` against the REAL served bundle
     * (`GET /api/flows/publication/ui.js`, the same Vite build that route invokes) and asserts the
     * real `RenderedImage` component (`examples/publication/components/RenderedImage.tsx`, the
     * `flow.ui.tsx` default-exports it for the `render` node) actually renders inside the `render`
     * node card's inline output slot — not `GenericOutput`'s raw-JSON fallback every other test in
     * this file exercises instead, deliberately, by pointing `extensionBundleUrl` at an unknown
     * flow id.
     *
     * ONE substitution, exactly where the brief allows it: `importModule`. It does nothing but
     * forward to a genuine dynamic `import()` — the same expression `loadFlowUi`'s own
     * `defaultImportModule` already uses. Everything upstream of it stays real: the real `fetch`
     * of the real bundle, and `extensionLoader.ts`'s own unedited `rewriteBareSpecifiers`.
     *
     * WHY the substitution is still needed even though it only forwards to a real `import()`:
     * probed directly against this exact vitest/jsdom environment before writing this test.
     * `globalThis.URL` inside a test file is not the same `URL` class `node:buffer`'s blob
     * registry is keyed against — the same cross-realm split as the `Uint8Array` fix earlier in
     * this file — so `URL.createObjectURL` exists here and returns a plausible `blob:nodedata:…`
     * string, but that string is neither `import()`-able (`Cannot find package
     * 'blob:nodedata:…'`) nor readable back out through `fetch` or `node:buffer`'s
     * `resolveObjectURL` from this realm. `extensionLoader.ts`'s own `toBlobUrl` already has a
     * working, UNEDITED fallback for exactly this situation — a `data:` URL — gated on
     * `typeof URL.createObjectURL !== 'function'`; probing confirmed a `data:` URL imports
     * correctly here, including one nested inside another (the exact shape `loadFlowUi` produces
     * when an external is shimmed). Deleting `URL.createObjectURL` for the scope of this test
     * (restored in the `finally` below) makes `toBlobUrl` take that already-existing branch,
     * unedited, instead of the one this particular test harness cannot use. This is the same
     * environment fact `extensionLoader.ts`'s own doc comment anticipated ("jsdom implements
     * neither blob-URL import() nor createObjectURL") — `createObjectURL` merely turns out to
     * exist here, for the cross-realm reason above, where that comment expected it not to.
     */
    const savedCreateObjectURL = URL.createObjectURL
    // @ts-expect-error -- deliberately removed for the scope of this test only; see the comment
    // above. Restored in `finally`.
    URL.createObjectURL = undefined
    try {
      const realExternals = {
        '@jobik/ui': jobikUi as unknown as Record<string, unknown>,
        react: React as unknown as Record<string, unknown>,
        'react-dom': ReactDOM as unknown as Record<string, unknown>,
        'react-dom/client': ReactDOMClient as unknown as Record<string, unknown>,
        'react/jsx-runtime': ReactJsxRuntime as unknown as Record<string, unknown>,
      }
      const realImportModule = (moduleUrl: string) => import(/* @vite-ignore */ moduleUrl)

      render(
        <StudioApp
          client={{
            ...client,
            extensionBundleUrl: () => `${server.url}/api/flows/publication/ui.js`,
          }}
          externals={realExternals}
          importModule={realImportModule}
        />,
      )

      await waitFor(() => expect(screen.getByTestId('run-input-title')).toBeInTheDocument())
      await userEvent.type(screen.getByTestId('run-input-title'), publicationSampleInput.title)
      await userEvent.type(
        screen.getByTestId('run-input-markdown'),
        publicationSampleInput.markdown,
      )
      await userEvent.click(screen.getByTestId('run-start-button'))

      await waitFor(() => expect(screen.getByTestId('run-outputs-label')).toBeInTheDocument(), {
        timeout: 30_000,
      })

      // The proof: the `render` node card's inline output slot holds `RenderedImage`'s own
      // `<img>`, not `GenericOutput`'s raw-JSON well. `userEvent.type` does not insert the
      // literal `\n`s inside `publicationSampleInput.markdown` as real newlines (a pre-existing
      // fact of this suite's typed-textarea inputs, not something this test introduces —
      // `captionFor`'s heading regex then matches the whole typed string as one line), so the
      // caption is not byte-identical to `publicationExpectedCaption`; asserting `toContain` on
      // its first, unambiguous fragment still ties this to the real typed input rather than to a
      // hard-coded string, while the `src` pattern proves the real `assetUrl()` the server's own
      // `/api/assets/:id` route answers under, and the two elements below prove the OUTPUT slot
      // this is inside holds an `<img>`, not `GenericOutput`.
      const nodeCard = screen.getByTestId('node-card-render')
      const image = await waitFor(() => within(nodeCard).getByRole('img'))
      expect(image).toHaveAttribute('alt', expect.stringContaining('Release 0.4'))
      expect((image as HTMLImageElement).src).toMatch(/\/api\/assets\//)
      expect(within(nodeCard).queryByTestId('generic-output')).toBeNull()
    } finally {
      URL.createObjectURL = savedCreateObjectURL as typeof URL.createObjectURL
    }
  })

  it('marks the draft dirty on a real canvas edit and saves it to disk', async () => {
    const view = mount()
    await waitFor(() => expect(screen.getByTestId('node-card-render')).toBeInTheDocument())

    const before = JSON.parse(await readFile(documentPath, 'utf8')) as {
      layout: Record<string, { x: number; y: number }>
    }
    expect(before.layout.render).toEqual({ x: 386, y: 150 })
    expect(screen.queryByTestId('studio-dirty')).toBeNull()

    // The canvas's own drag is React Flow's; the draft edit it produces is what this asserts.
    // Reaching it through the public surface means saving after a real layout change, so the edit
    // is made through the same `mousedown`/`mousemove`/`mouseup` cycle a real user's drag fires.
    dragNode(view.container, 'render', 64, -24)

    // R8: the ruling this replaces asserted nothing about an edit at all. This waits on the actual
    // unsaved indicator `TopBar` renders once `draft.dirty` flips true.
    await waitFor(() => expect(screen.getByTestId('studio-dirty')).toBeInTheDocument())

    await userEvent.click(screen.getByText('Save').closest('button') as HTMLElement)

    await waitFor(async () => {
      const after = JSON.parse(await readFile(documentPath, 'utf8')) as {
        format: string
        layout: Record<string, { x: number; y: number }>
      }
      expect(after.format).toBe('jobik.flow')
      // The exact position the drag above produced — proof the save wrote the real edit, not just
      // the untouched document.
      expect(after.layout.render).toEqual({ x: 450, y: 126 })
    })
    expect(screen.queryByTestId('studio-conflict-chip')).toBeNull()
    await waitFor(() => expect(screen.queryByTestId('studio-dirty')).toBeNull())
  })

  it('offers reload and copy-draft when the file changed on disk, and writes nothing', async () => {
    mount()
    // `studio-top-bar` renders on the very first paint, before the draft has loaded — `save()`
    // no-ops on an undefined draft, so this waits for a marker `loaded` (`descriptor !== undefined`)
    // actually gates, the same one the first test in this file already waits on.
    await waitFor(() =>
      expect(screen.getByTestId('studio-flow-row-publication')).toBeInTheDocument(),
    )

    // Change the file behind the editor's back, exactly as the closeout drill describes.
    const external = JSON.parse(await readFile(documentPath, 'utf8')) as Record<string, unknown>
    const layout = external.layout as Record<string, { x: number; y: number }>
    layout.publish = { x: 900, y: 400 }
    await writeFile(documentPath, `${JSON.stringify(external, null, 2)}\n`, 'utf8')

    await userEvent.click(screen.getByText('Save').closest('button') as HTMLElement)

    await waitFor(() => expect(screen.getByTestId('studio-conflict-chip')).toBeInTheDocument())
    expect(screen.getByTestId('studio-conflict-reload')).toBeInTheDocument()
    expect(screen.getByTestId('studio-conflict-copy')).toBeInTheDocument()

    // Never overwritten: the external edit is still on disk.
    const onDisk = JSON.parse(await readFile(documentPath, 'utf8')) as {
      layout: Record<string, { x: number; y: number }>
    }
    expect(onDisk.layout.publish).toEqual({ x: 900, y: 400 })

    // Reload adopts the file and clears the conflict.
    await userEvent.click(screen.getByTestId('studio-conflict-reload'))
    await waitFor(() => expect(screen.queryByTestId('studio-conflict-chip')).toBeNull())
  })

  it('validates the loaded draft against the server', async () => {
    // R8: the ruling this replaces waited on an element already on screen and asserted the
    // absence of the SAVE-conflict chip, which validation cannot ever produce. This counts the
    // real `POST /api/flows/:id/validate` request the click sends and asserts it carried the
    // draft's document.
    const calls: { flowId: string; document: FlowDocument }[] = []
    const validate = vi.fn((flowId: string, document: FlowDocument) => {
      calls.push({ flowId, document })
      return client.validate(flowId, document)
    })

    mount({ validate })
    // Same race the reload/copy-draft test guards against: `validate()` no-ops until the draft has
    // loaded, so this waits for the same `loaded`-gated marker rather than the always-present
    // `studio-top-bar`.
    await waitFor(() =>
      expect(screen.getByTestId('studio-flow-row-publication')).toBeInTheDocument(),
    )

    await userEvent.click(screen.getByText('Validate').closest('button') as HTMLElement)

    await waitFor(() => expect(validate).toHaveBeenCalledTimes(1))
    expect(calls[0]?.flowId).toBe('publication')
    const onDisk = JSON.parse(await readFile(documentPath, 'utf8')) as FlowDocument
    expect(calls[0]?.document).toEqual(onDisk)

    // The request actually reached the real server and the real server actually answered it.
    const result = await validate.mock.results[0]?.value
    expect(result).toEqual({ valid: true })
  })

  it('falls back to the generic output viewer when no extension loads', {
    timeout: 60_000,
  }, async () => {
    mount()

    await waitFor(() => expect(screen.getByTestId('run-input-title')).toBeInTheDocument())
    await userEvent.type(screen.getByTestId('run-input-title'), publicationSampleInput.title)
    await userEvent.type(screen.getByTestId('run-input-markdown'), publicationSampleInput.markdown)
    await userEvent.click(screen.getByTestId('run-start-button'))

    await waitFor(() => expect(screen.getAllByTestId('generic-output').length).toBeGreaterThan(0), {
      timeout: 30_000,
    })
  })

  it('serves a real flow-local extension bundle over HTTP', { timeout: 120_000 }, async () => {
    const response = await fetch(`${server.url}/api/flows/publication/ui.js`)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    const source = await response.text()
    expect(source.length).toBeGreaterThan(0)
    // P13's hand-off: the bundle leaves with bare specifiers, which is exactly what
    // `extensionLoader.rewriteBareSpecifiers` exists to resolve.
    expect(source).toMatch(/['"]@jobik\/ui['"]|['"]react\/jsx-runtime['"]/)
  })

  it('never sends a handler, an absolute path, a raw stack or a cause to the browser', {
    timeout: 30_000,
  }, async () => {
    // Bundled minor (fix round 1): sweeping only `GET /api/flows/:id`'s success path is close to
    // a tautology — `descriptor.ts` already makes it clean by construction. The place this logic
    // actually operates is `runWire.ts`'s trimmed-stack and cause handling, on a completed run's
    // report and on an error payload from a genuinely failing node — swept below too, over two
    // real runs against the real server.
    const assertSafe = (raw: string) => {
      expect(raw).not.toContain('"stack"')
      expect(raw).not.toContain('"cause"')
      expect(raw).not.toMatch(/[A-Za-z]:\\\\|\/Users\/|\/home\//)
      expect(raw).not.toContain('"run"')
    }

    const loaded = await (await fetch(`${server.url}/api/flows/publication`)).text()
    assertSafe(loaded)

    // A completed run's report payload — the NDJSON stream's raw text, unparsed, so nothing this
    // test does not explicitly check for could hide in a field `readNdjsonStream` would have
    // dropped.
    const okRun = await fetch(`${server.url}/api/flows/publication/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ startId: 'start1', input: publicationSampleInput }),
    })
    const okRaw = await okRun.text()
    assertSafe(okRaw)
    expect(okRaw).toContain('run-settled')

    // An error payload from a genuinely failing node. `render`'s handler RETURNS `ImageRenderError`
    // (it never throws) for an inlined asset naming a colour profile it does not support — the
    // "authored" wire shape `runWire.ts`'s own doc comment names, `{ _tag, message, authored: true
    // }`, which by construction carries neither a `stack` nor a `cause` (only a THROWN failure is
    // wrapped as `NodeExecutionError` and stack-trimmed instead). This is the one node failure the
    // publication example can produce without touching the frozen `core`/`server` packages; it
    // still exercises the same `serialiseRunReport` → `toNodeWireError` path a thrown one would.
    const failingRun = await fetch(`${server.url}/api/flows/publication/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        startId: 'start1',
        input: {
          title: publicationSampleInput.title,
          markdown: [
            '## Release 0.4',
            'intro',
            '',
            '![cover](assets/cover.png#profile=display-p3)',
          ].join('\n'),
        },
      }),
    })
    const failingRaw = await failingRun.text()
    assertSafe(failingRaw)
    // The failing run actually reached and failed the node under test — an assertion that could
    // never fail proves nothing about what it swept.
    expect(failingRaw).toContain('ImageRenderError')
  })
})
