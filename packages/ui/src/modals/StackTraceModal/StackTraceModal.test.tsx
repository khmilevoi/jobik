import type { FlowDocument } from '@jobik/core'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  JobikClient,
  RunStreamEvent,
  SafeFlowDescriptorPayload,
  WireRunReportPayload,
} from '#client/index.js'
import type { StudioDeps, StudioModel } from '#model/index.js'
import { reatomStudio, StudioModelProvider } from '#model/index.js'
import { StackTraceModal } from './StackTraceModal.js'

/**
 * The dialog reads `RunPanelModel` and takes no props, so every case drives one — a real
 * `reatomStudio` in a `StudioModelProvider`, with a run actually started against a stub server that
 * fails it. That is the only way this dialog opens, and asserting it that way is the point: F-M2
 * was a *reachability* finding, and a prop-driven case cannot tell whether anything can reach it.
 *
 * **What the wire carries is what is asserted.** `3C` draws three meta rows and an accent
 * `↳ show 6 hidden frames` link; the endpoint can fill one row, and the frames behind that count
 * never leave the server. The cases that used to assert the other two rows through props were
 * deleted with the props — the component still has a grid, nothing can fill it, and inventing a
 * model member to do so is exactly the fabrication `RunPanelModel.trace` refuses. The absences
 * below are themselves assertions about the wire.
 */

const DOCUMENT = {
  format: 'jobik.flow',
  version: 1,
  connections: [],
  literals: {},
  layout: { start1: { x: 0, y: 0 }, render: { x: 300, y: 0 } },
} as unknown as FlowDocument

const DESCRIPTOR = {
  id: 'publication',
  name: 'publication',
  documentFile: 'flow.jobik.json',
  sourceFile: 'flow.ts',
  startIds: ['start1'],
  nodes: [
    {
      id: 'start1',
      kind: 'start' as const,
      title: 'start',
      input: { nodeId: 'start1', fields: [] },
      output: { nodeId: 'start1', fields: [] },
    },
    {
      id: 'render',
      kind: 'transform' as const,
      title: 'imageOut',
      input: { nodeId: 'render', fields: [] },
      output: { nodeId: 'render', fields: [] },
    },
  ],
} as unknown as SafeFlowDescriptorPayload

/** `3C`'s own error, with the frames `07-copy.md` §4.4 prints and the count the server trims to. */
const RENDER_FAILURE = {
  _tag: 'ImageRenderError',
  message: 'Unsupported colour profile in the inlined asset.',
  frames: [
    { fn: 'imageOut.raster', file: 'imageOut.ts', line: 184 },
    { fn: 'imageOut.invoke', file: 'imageOut.ts', line: 96 },
    { fn: 'render.invoke', file: 'flow.ts', line: 41 },
    { fn: 'runtime.step', file: 'runtime.ts', line: 512 },
  ],
  hiddenFrames: 6,
}

const FAILED_REPORT = {
  flowName: 'publication',
  startId: 'start1',
  runNumber: 220,
  status: 'failed' as const,
  elapsedMs: 800,
  nodes: [
    {
      nodeId: 'start1',
      status: 'ok' as const,
      elapsedMs: 10,
      output: {},
      assets: {},
      error: null,
    },
    {
      nodeId: 'render',
      status: 'failed' as const,
      elapsedMs: 790,
      output: null,
      assets: {},
      error: RENDER_FAILURE,
    },
  ],
  logs: [],
  error: RENDER_FAILURE,
} as unknown as WireRunReportPayload

function streamOf(events: readonly RunStreamEvent[]) {
  return (async function* () {
    for (const event of events) yield event
  })()
}

function stubClient(overrides: Partial<JobikClient> = {}): JobikClient {
  return {
    listFlows: async () => [{ id: 'publication', name: 'publication', nodeCount: 2 }],
    loadFlow: async () => ({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: 'rev-1' }),
    validate: async () => ({ valid: true }),
    save: async () => ({ revision: 'rev-2' }),
    startRun: async () =>
      streamOf([
        { type: 'run-accepted', runToken: 'tok' },
        { type: 'run-settled', report: FAILED_REPORT },
      ]),
    cancelRun: async () => true,
    assetUrl: (asset: { readonly id: string }) => `/api/assets/${asset.id}`,
    extensionBundleUrl: () => '/api/flows/publication/ui.js',
    ...overrides,
  } as unknown as JobikClient
}

const connected: (() => void)[] = []

afterEach(() => {
  for (const off of connected.splice(0)) off()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  cleanup()
})

/**
 * A loaded flow, a failed run, and the dialog opened the way the canvas opens it.
 *
 * The subscriptions are what a mounted Studio supplies and this test does not render: a shut dialog
 * reads `runPanel.trace` and nothing underneath it, so without them no flow would load and no run
 * would have a start to run from.
 */
async function mountFailed(client: JobikClient = stubClient()): Promise<StudioModel> {
  const deps: StudioDeps = { client, now: () => 1_700_000_000_000 }
  const model = reatomStudio(deps)
  connected.push(model.flows.descriptor.subscribe(() => {}))
  connected.push(model.runPanel.state.subscribe(() => {}))
  connected.push(() => model.runPanel.closeTrace())

  render(
    <StudioModelProvider model={model}>
      <StackTraceModal />
    </StudioModelProvider>,
  )
  await waitFor(() => {
    expect(model.flows.descriptor()).toBeDefined()
  })
  await act(async () => {
    await model.run.start({})
  })
  return model
}

/** What the failed node card's `View trace` does — `model/canvas.tsx` calls exactly this. */
async function openTrace(model: StudioModel): Promise<void> {
  await act(async () => {
    model.runPanel.openTrace()
  })
  await screen.findByTestId('stack-trace-modal')
}

describe('StackTraceModal', () => {
  it('is not on screen until View trace is pressed', async () => {
    const model = await mountFailed()
    expect(screen.queryByTestId('stack-trace-modal')).toBeNull()

    await openTrace(model)
    expect(screen.getByRole('heading', { name: 'Stack trace' })).toBeInTheDocument()
  })

  it('draws the artboard header from the run that failed', async () => {
    await openTrace(await mountFailed())
    expect(screen.getByTestId('modal-context')).toHaveTextContent('render · run #220 · 0.8s')
  })

  it('draws the error class and its sentence', async () => {
    await openTrace(await mountFailed())
    expect(screen.getByTestId('trace-error-class')).toHaveTextContent('ImageRenderError')
    expect(screen.getByTestId('trace-error-message')).toHaveTextContent(
      'Unsupported colour profile in the inlined asset.',
    )
  })

  it('numbers every frame and prints its source location', async () => {
    await openTrace(await mountFailed())
    expect(screen.getAllByTestId('trace-frame').map((node) => node.textContent)).toEqual([
      '1 at imageOut.raster (imageOut.ts:184)',
      '2 at imageOut.invoke (imageOut.ts:96)',
      '3 at render.invoke (flow.ts:41)',
      '4 at runtime.step (runtime.ts:512)',
    ])
  })

  /**
   * `3C` draws this as an accent link. It is drawn as the design's own static form of the same
   * line — `Run panel — states`' `↳ 6 frames hidden` — because the frames it counts never leave
   * the server, so a press could disclose nothing. It is therefore not a button.
   */
  it('states the trimmed frames without offering to disclose them', async () => {
    await openTrace(await mountFailed())
    const line = screen.getByTestId('trace-hidden-frames')
    expect(line).toHaveTextContent('↳ 6 frames hidden')
    expect(screen.queryByRole('button', { name: /frames hidden/ })).toBeNull()
  })

  /** The honesty rule, as an absence: `input` and `runtime` have no wire field behind them. */
  it('draws only the meta row the wire can fill', async () => {
    await openTrace(await mountFailed())
    expect(screen.getAllByTestId('trace-meta-label').map((node) => node.textContent)).toEqual([
      'node',
    ])
    expect(screen.getAllByTestId('trace-meta-value').map((node) => node.textContent)).toEqual([
      'render · transform',
    ])
  })

  it('copies the trace and swaps the header control to the settled Copied chip', async () => {
    const writeText = vi.fn(async (_text: string) => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const model = await mountFailed()
    await openTrace(model)

    expect(screen.queryByTestId('trace-copied')).toBeNull()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    })

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(String(writeText.mock.calls[0]?.[0])).toContain('at render.invoke (flow.ts:41)')
    expect(await screen.findByTestId('trace-copied')).toHaveTextContent('Copied')
  })

  it('runs Retry node through the run model and leaves with it', async () => {
    const model = await mountFailed()
    await openTrace(model)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry node' }))
    })

    expect(model.runPanel.traceOpen()).toBe(false)
    await waitFor(() => {
      expect(screen.queryByTestId('stack-trace-modal')).toBeNull()
    })
  })

  it('saves the trace through an anchor click', async () => {
    const model = await mountFailed()
    await openTrace(model)

    // Stubbed only now that the tree is mounted: `render` itself calls `createElement`, so a spy
    // installed before it would hand React the anchor instead of a container.
    const clicked: string[] = []
    const link = { href: '', download: '', click: () => clicked.push(link.download) }
    vi.spyOn(globalThis.document, 'createElement').mockReturnValue(
      link as unknown as HTMLAnchorElement,
    )
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:trace', revokeObjectURL: () => {} })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save trace/ }))
    })

    expect(clicked).toEqual(['render-run-220-trace.txt'])
  })

  it('is non-destructive: esc and the backdrop both dismiss it', async () => {
    const model = await mountFailed()
    await openTrace(model)

    const dialog = screen.getByTestId('stack-trace-modal')
    await act(async () => {
      fireEvent.keyDown(dialog, { key: 'Escape' })
    })
    expect(model.runPanel.traceOpen()).toBe(false)

    await openTrace(model)
    await act(async () => {
      fireEvent.click(screen.getByTestId('stack-trace-modal'))
    })
    expect(model.runPanel.traceOpen()).toBe(false)
  })

  it('draws the footer hint verbatim', async () => {
    await openTrace(await mountFailed())
    expect(screen.getByTestId('modal-hint')).toHaveTextContent('esc to close')
  })

  /**
   * Seen in the running Studio: the showcase's `ImageRenderError` is an expected failure a handler
   * `return`s, so it reaches the client with no `frames` array — and the bordered frame well was
   * drawn anyway, as an empty box no artboard has. It is drawn only when it has something in it.
   */
  it('draws no frame well at all when the payload carried no frames', async () => {
    const noFrames = { _tag: 'ImageRenderError', message: 'Unsupported colour profile.' }
    await openTrace(
      await mountFailed(
        stubClient({
          startRun: async () =>
            streamOf([
              { type: 'run-accepted', runToken: 'tok' },
              {
                type: 'run-settled',
                report: {
                  ...FAILED_REPORT,
                  nodes: [FAILED_REPORT.nodes[0], { ...FAILED_REPORT.nodes[1], error: noFrames }],
                  error: noFrames,
                } as unknown as WireRunReportPayload,
              },
            ]),
        }),
      ),
    )

    expect(screen.getByTestId('trace-error-class')).toHaveTextContent('ImageRenderError')
    expect(screen.queryByTestId('trace-frames')).toBeNull()
    expect(screen.queryByTestId('trace-hidden-frames')).toBeNull()
    // The meta grid is still there: the row it draws comes from the document, not from the stack.
    expect(screen.getAllByTestId('trace-meta-value').map((node) => node.textContent)).toEqual([
      'render · transform',
    ])
  })
})
