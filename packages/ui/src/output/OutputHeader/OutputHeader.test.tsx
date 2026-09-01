import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JobikClient, WireRunReportPayload } from '#client/index.js'
import type { StudioDeps, StudioModel } from '#model/index.js'
import { reatomStudio, StudioModelProvider } from '#model/index.js'
import type { OutputActionsModel } from '#model/output.js'
import type { DownloadState } from '#primitives/index.js'
import type { RunSession } from '#studio/runSession.js'
import { OutputHeader, type OutputHeaderProps } from './OutputHeader.js'

/**
 * The header draws `3A`'s two cells off `OutputActionsModel`, so every case here mounts it over a
 * real `reatomStudio` in a `StudioModelProvider`, with a settled run written into `run.session` and
 * the viewer opened on the node the artboard shows.
 *
 * **Nothing awaits inside a Reatom frame**, which is what keeps this file free of `wrap`: the
 * model's atoms are written before the first render, and `render`, `userEvent` and `findBy*` all
 * run outside one. The *timings* are not retested here either — `model/output.test.ts` pins the
 * 400 ms spinner threshold, the 1.6 s hold and the 1.8 s hold against a fake clock, and doing it
 * again through a render would only be the same assertion with a DOM in the way. What this file
 * owns is the wiring: that the label swaps to the cell the artboard draws, and that the press
 * reaches the model.
 */

const NOW = 1_700_000_000_000

const REPORT: WireRunReportPayload = {
  flowName: 'publication',
  startId: 'start1',
  runNumber: 219,
  status: 'ok',
  elapsedMs: 2400,
  nodes: [
    {
      nodeId: 'render',
      status: 'ok',
      elapsedMs: 2100,
      output: {},
      assets: {
        image: { type: 'Buffer' as const, mime: 'image/png', bytes: 412_000, id: 'asset-1' },
      },
      error: null,
    },
  ],
  logs: [],
  error: null,
} as unknown as WireRunReportPayload

/** The settled session every read-only surface projects. */
function sessionOf(report: WireRunReportPayload): RunSession {
  return {
    startId: report.startId,
    runToken: 'tok',
    runNumber: report.runNumber,
    nodeCount: report.nodes.length,
    startedAt: NOW,
    nodes: new Map(),
    logs: report.logs,
    report,
    failure: undefined,
    cancelling: false,
  }
}

/**
 * Nothing here calls the client: every request in the model sits behind a `computed` this component
 * never reads, so the stub only has to satisfy the type.
 */
function stubClient(): JobikClient {
  return {
    listFlows: vi.fn(),
    loadFlow: vi.fn(),
    validate: vi.fn(),
    save: vi.fn(),
    startRun: vi.fn(),
    cancelRun: vi.fn(),
    assetUrl: vi.fn(() => '/api/assets/x'),
    extensionBundleUrl: vi.fn(() => '/api/flows/x/ui.js'),
  } as unknown as JobikClient
}

/** jsdom ships no clipboard, so a case that wants one says so. Absent *is* the refusal case. */
function stubClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
}

/** jsdom ships no `URL.createObjectURL` either, which is why the download case stubs both halves. */
function stubObjectUrls(url: string): ReturnType<typeof vi.fn> {
  const createObjectURL = vi.fn((_blob: Blob) => url)
  globalThis.URL.createObjectURL = createObjectURL as typeof globalThis.URL.createObjectURL
  globalThis.URL.revokeObjectURL = vi.fn() as typeof globalThis.URL.revokeObjectURL
  return createObjectURL
}

const originalCreateObjectURL = globalThis.URL.createObjectURL
const originalRevokeObjectURL = globalThis.URL.revokeObjectURL

/** The model the last `mount` built, so a hold still standing at the end of a case is cancelled. */
let mounted: StudioModel | undefined
let disconnect: (() => void) | undefined

afterEach(() => {
  mounted?.output.reset()
  disconnect?.()
  mounted = undefined
  disconnect = undefined
  cleanup()
  globalThis.URL.createObjectURL = originalCreateObjectURL
  globalThis.URL.revokeObjectURL = originalRevokeObjectURL
  Reflect.deleteProperty(globalThis.navigator, 'clipboard')
  vi.restoreAllMocks()
})

function mount(props: Partial<OutputHeaderProps> = {}) {
  const deps: StudioDeps = { client: stubClient(), now: () => NOW }
  const model = reatomStudio(deps)
  mounted = model

  /**
   * `StudioApp` reads `openViewerNode()` on every render, and that read is what keeps
   * `viewerNodeId` connected in the real Studio — it is an atom with a `withComputed` behind it,
   * so a write nobody is subscribed to is a write its first computation drops. This header mounts
   * on its own, so the case holds that subscription in the shell's place.
   */
  disconnect = model.output.openViewerNode.subscribe(() => {})

  model.run.session.set(sessionOf(REPORT))
  model.output.open('render')

  const ui = (overrides: Partial<OutputHeaderProps> = props) => (
    <StudioModelProvider model={model}>
      <OutputHeader variant="dock" tab="preview" onTabChange={() => {}} {...overrides} />
    </StudioModelProvider>
  )

  // The same intersection `OutputHeader` states: `reatomOutput` returns the two `3A` cells, and
  // `model/types.ts` has not named them on `OutputModel` yet.
  const actions = model.output as typeof model.output & OutputActionsModel

  return { model, actions, ui, view: render(ui()) }
}

describe('OutputHeader', () => {
  it('draws the three tabs in the order the design fixes', () => {
    mount({ variant: 'card' })
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Preview',
      'Raw',
      'Logs',
    ])
  })

  it('marks the active tab selected and the others not', () => {
    mount({ variant: 'dock', tab: 'raw' })
    expect(screen.getByRole('tab', { name: 'Raw' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: 'Logs' })).toHaveAttribute('aria-selected', 'false')
  })

  it('reports the tab a click selects', async () => {
    const onTabChange = vi.fn()
    mount({ variant: 'card', onTabChange })
    await userEvent.click(screen.getByRole('tab', { name: 'Logs' }))
    expect(onTabChange).toHaveBeenCalledWith('logs')
  })

  it('hides the 1 × 16 rule with the context line it introduces', () => {
    const { ui, view } = mount({ variant: 'card' })
    expect(screen.queryByTestId('output-viewer-divider')).toBeNull()
    expect(screen.queryByTestId('output-viewer-source')).toBeNull()

    view.rerender(ui({ variant: 'dock', context: 'render.image · Buffer[3] · run #221' }))
    expect(screen.getByTestId('output-viewer-divider')).toBeInTheDocument()
    expect(screen.getByTestId('output-viewer-source')).toHaveTextContent(
      'render.image · Buffer[3] · run #221',
    )
  })

  it('draws the actions and the trailing slot in one group', () => {
    mount({ copyAll: true, download: true, trailing: <div data-testid="trailing" /> })
    expect(screen.getByRole('button', { name: 'Copy all' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
    expect(screen.getByTestId('trailing')).toBeInTheDocument()
  })

  it('omits an action the caller did not wire', () => {
    mount({ variant: 'card', copyAll: true })
    expect(screen.getByRole('button', { name: 'Copy all' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
  })

  it('shows the right-hand mono readout when one is supplied', () => {
    mount({ variant: 'card', tab: 'raw', meta: 'json · 1.4 kb' })
    expect(screen.getByTestId('output-viewer-meta')).toHaveTextContent('json · 1.4 kb')
  })
})

/**
 * `3A`'s sequences, from the header that draws them. The button reports the work because nothing
 * else on this row does — the decision table's "in-button loader" column — and the work itself is
 * `model/output.ts`'s, which is why the assertions below are about what the model was asked to do.
 */
describe('OutputHeader — the copy and download sequences', () => {
  it('runs the copy sequence and swaps the label to the artboard cell', async () => {
    const writeText = vi.fn(async (_text: string) => {})
    stubClipboard(writeText)
    mount({ copyAll: true })

    await userEvent.click(screen.getByRole('button', { name: 'Copy all' }))

    // R33: `Copy all` copies the report the `Raw` tab renders, which only the model has.
    expect(writeText).toHaveBeenCalledWith(JSON.stringify(REPORT, null, 2))
    // Rule 01: a clipboard write is synchronous, so it goes straight to `Copied` — no spinner.
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  /**
   * The failure the model can actually meet, and the one this environment ships: a browser with no
   * clipboard at all. Nothing was written, so `3A`'s failed cell is the one honest thing to draw —
   * where the deleted `createCopyAction` stated the same rule for a `CopyWrite` that *returned* an
   * `Error`, an injection point the model does not have because it performs the write itself.
   */
  it('shows the failed cell when the browser refuses the clipboard', async () => {
    mount({ copyAll: true })

    await userEvent.click(screen.getByRole('button', { name: 'Copy all' }))

    expect(await screen.findByRole('button', { name: 'Copy failed' })).toBeInTheDocument()
  })

  /**
   * Rule 03: no byte count reaches the wire, so the download never leaves the indeterminate
   * branch — spinner, then `Saved`. It must never show a percentage it cannot know.
   */
  it('runs Download through Preparing to Saved without inventing a percentage', async () => {
    stubObjectUrls('blob:mock-download-url')
    const { actions } = mount({ download: true })
    const cells: DownloadState[] = []
    const stop = actions.downloadState.subscribe((cell) => cells.push(cell))

    /*
     * `3A` §3.1's `busy` cell, written onto the model rather than reached through a press: writing
     * the file is synchronous, so `busy` and `ok` settle in one microtask and no frame can draw the
     * first. The label map is this component's own statement either way, and the percentage it must
     * not invent is what the custom property would carry.
     */
    actions.downloadState.set('busy')
    const preparing = await screen.findByRole('button', { name: 'Preparing' })
    expect(preparing.style.getPropertyValue('--jbk-button-progress')).toBe('')
    actions.downloadState.set('idle')

    await userEvent.click(await screen.findByRole('button', { name: 'Download' }))

    expect(await screen.findByRole('button', { name: 'Saved' })).toBeInTheDocument()
    // Rule 03: nothing on the wire carries a byte count, so the determinate cell is never entered.
    expect(cells).toContain('busy')
    expect(cells).not.toContain('progress')
    stop()
  })
})
