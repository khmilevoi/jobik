import type { FlowDocument, NodeInputDescriptor } from '@jobik/core'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import * as z from 'zod'
import type { JobikClient, RunStreamEvent, WireRunReportPayload } from '#client/index.js'
import { reatomStudio, StudioModelProvider } from '#model/index.js'
import type { RunPanelState } from '#run/types.js'
import { RunDock } from '#shell/index.js'
import { RunPanel, RunPanelBody, RunPanelCard } from './RunPanel.js'

/**
 * The dock's body, from both ends.
 *
 * `RunPanel` reads `RunPanelModel.state` now, so every case that used to hand it a literal state is
 * driven through a real `reatomStudio` and a stub client instead — the same shape
 * `studio/StudioApp/StudioApp.test.tsx` uses, and for the same reason: this is a DOM behaviour test
 * and the model is what produces the DOM.
 *
 * The four "renders the X view" cases did not lose anything; what they always asserted is the
 * four-arm dispatch, and that dispatch now lives in `RunPanelBody`, which is still handed a state.
 * They moved there verbatim, fixtures included. `RunPanel` picked up cases of its own for the job
 * it gained: reading the model, and drawing nothing before there is anything to draw.
 */

afterEach(cleanup)

const descriptor: NodeInputDescriptor = {
  nodeId: 'start1',
  fields: [{ field: 'title', required: true, annotation: 'string', control: { kind: 'string' } }],
}

const IDLE: RunPanelState = {
  kind: 'idle',
  entryNodeId: 'start1',
  note: 'Inputs are typed from the flow declaration.',
  descriptor,
  input: z.object({ title: z.string() }),
  draft: { title: 'Typed flows, quietly' },
}

const RUNNING: RunPanelState = {
  kind: 'running',
  runNumber: 219,
  elapsed: '1.3s',
  completedNodes: 1,
  totalNodes: 3,
  progress: 0.54,
  nodes: [{ nodeId: 'render', status: 'running', elapsed: '1.3s' }],
}

const FAILED: RunPanelState = {
  kind: 'failed',
  runNumber: 220,
  elapsed: '0.8s',
  error: { name: 'ImageRenderError', nodeId: 'render', message: 'Unsupported colour profile.' },
  nodes: [{ nodeId: 'render', status: 'failed' }],
}

const COMPLETED: RunPanelState = {
  kind: 'completed',
  runNumber: 221,
  elapsed: '2.4s',
  nodes: [{ nodeId: 'render', status: 'ok', elapsed: '2.1s' }],
}

const DOCUMENT = {
  format: 'jobik.flow',
  version: 1,
  connections: [
    { from: { node: 'start1', field: 'title' }, to: { node: 'render', field: 'title' } },
  ],
  literals: {},
  layout: { start1: { x: 56, y: 248 }, render: { x: 386, y: 150 } },
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
      input: {
        nodeId: 'start1',
        fields: [
          {
            field: 'title',
            required: true,
            annotation: 'string',
            control: { kind: 'string' as const },
          },
        ],
      },
      output: {
        nodeId: 'start1',
        fields: [{ field: 'title', required: true, annotation: 'string' }],
      },
    },
    {
      id: 'render',
      kind: 'transform' as const,
      title: 'imageOut',
      input: {
        nodeId: 'render',
        fields: [
          {
            field: 'title',
            required: true,
            annotation: 'string',
            control: { kind: 'string' as const },
          },
        ],
      },
      output: {
        nodeId: 'render',
        fields: [
          { field: 'image', required: true, annotation: 'Buffer', asset: { mime: 'image/png' } },
        ],
      },
    },
  ],
}

const REPORT: WireRunReportPayload = {
  flowName: 'publication',
  startId: 'start1',
  runNumber: 219,
  status: 'ok' as const,
  elapsedMs: 2400,
  nodes: [
    {
      nodeId: 'start1',
      status: 'ok' as const,
      elapsedMs: 10,
      output: { title: 't' },
      assets: {},
      error: null,
    },
    {
      nodeId: 'render',
      status: 'ok' as const,
      elapsedMs: 2100,
      output: {},
      assets: {
        image: { type: 'Buffer' as const, mime: 'image/png', bytes: 412_000, id: 'asset-1' },
      },
      error: null,
    },
  ],
  logs: [{ nodeId: 'render', message: 'layout pass complete', at: 310 }],
  error: null,
}

const IMAGE_RENDER_ERROR = {
  _tag: 'ImageRenderError',
  message: 'Unsupported colour profile in the inlined asset.',
  authored: true,
}

const FAILED_REPORT: WireRunReportPayload = {
  ...REPORT,
  status: 'failed' as const,
  elapsedMs: 800,
  nodes: [
    REPORT.nodes[0],
    {
      nodeId: 'render',
      status: 'failed' as const,
      elapsedMs: 800,
      output: null,
      assets: {},
      error: IMAGE_RENDER_ERROR,
    },
  ],
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
    startRun: async () => streamOf([{ type: 'run-accepted', runToken: 'tok' }]),
    cancelRun: async () => true,
    assetUrl: (asset: { readonly id: string }) => `/api/assets/${asset.id}`,
    extensionBundleUrl: () => '/api/flows/publication/ui.js',
    ...overrides,
  } as unknown as JobikClient
}

/**
 * One model per mount, provided the way `StudioApp` provides it.
 *
 * There is no `context.start()` and no `wrap` here on purpose: nothing in this file awaits inside a
 * Reatom frame. `render`, `userEvent` and `waitFor` all run outside one, and the model's own units
 * carry their frame with them.
 */
function mountPanel(client: JobikClient, node?: ReactNode) {
  const model = reatomStudio({ client, externals: {}, importModule: async () => ({}) })
  return render(<StudioModelProvider model={model}>{node ?? <RunPanel />}</StudioModelProvider>)
}

/** Types a title and presses the panel's own `Run`, which is what starts the stub's stream. */
async function runFromPanel() {
  await waitFor(() => expect(screen.getByTestId('run-input-title')).toBeInTheDocument())
  await userEvent.type(screen.getByTestId('run-input-title'), 'A post')
  await userEvent.click(screen.getByTestId('run-start-button'))
}

describe('RunPanelBody', () => {
  it('renders the idle form', () => {
    render(<RunPanelBody state={IDLE} />)
    expect(screen.getByTestId('run-input-title')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Run start1/ })).toBeInTheDocument()
  })

  it('renders the running progress and rows', () => {
    render(<RunPanelBody state={RUNNING} />)
    expect(screen.getByTestId('run-progress-summary').textContent).toBe('1 of 3 nodes complete')
    expect(screen.getByTestId('run-node-rows')).toBeInTheDocument()
  })

  it('renders the failed error well', () => {
    render(<RunPanelBody state={FAILED} />)
    expect(screen.getByTestId('run-error-name').textContent).toBe('ImageRenderError')
  })

  it('renders the completed timings, with no Outputs section', () => {
    render(<RunPanelBody state={COMPLETED} />)
    expect(screen.getByTestId('run-timing-value-render').textContent).toBe('2.1s')
    expect(screen.queryByTestId('run-outputs-label')).toBeNull()
  })
})

describe('RunPanel', () => {
  /**
   * Why `StudioApp` may hand the dock this component unconditionally: before a descriptor lands the
   * model has no state, and the panel draws nothing rather than a half-loaded body. `RunDock` draws
   * its own header either way.
   */
  it('draws nothing while the model has no state', () => {
    mountPanel(stubClient({ listFlows: async () => [] }))
    expect(screen.queryByTestId('run-panel-note')).toBeNull()
    expect(screen.queryByTestId('run-start-button')).toBeNull()
  })

  it('renders the idle form', async () => {
    mountPanel(stubClient())

    await waitFor(() => expect(screen.getByTestId('run-input-title')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Run start1/ })).toBeInTheDocument()
  })

  it('renders the running progress and rows', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    mountPanel(
      stubClient({
        startRun: async () =>
          (async function* () {
            yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
            yield {
              type: 'run-started',
              runNumber: 219,
              flowName: 'publication',
              startId: 'start1',
              nodeCount: 2,
            } as RunStreamEvent
            yield {
              type: 'node-status',
              nodeId: 'start1',
              status: 'ok',
              elapsedMs: 10,
              error: null,
            } as RunStreamEvent
            await gate
            yield { type: 'run-settled', report: REPORT } as RunStreamEvent
          })(),
      }),
    )
    await runFromPanel()

    await waitFor(() =>
      expect(screen.getByTestId('run-progress-summary').textContent).toBe('1 of 2 nodes complete'),
    )
    expect(screen.getByTestId('run-node-rows')).toBeInTheDocument()
    release()
  })

  it('renders the failed error well', async () => {
    mountPanel(
      stubClient({
        startRun: async () =>
          streamOf([
            { type: 'run-accepted', runToken: 'tok' },
            {
              type: 'run-started',
              runNumber: 220,
              flowName: 'publication',
              startId: 'start1',
              nodeCount: 2,
            },
            { type: 'run-settled', report: FAILED_REPORT },
          ]),
      }),
    )
    await runFromPanel()

    await waitFor(() => expect(screen.getByTestId('run-error-name')).toBeInTheDocument())
    expect(screen.getByTestId('run-error-name').textContent).toBe('ImageRenderError')
  })

  /**
   * `2A` draws the settled dock as timings, the inputs still editable, `Re-run start1`, then the
   * `Log` / `tail` block. There is no `Outputs` section any more (R8, retired): a run's output
   * lives only in the bottom `OutputDock`, which now auto-opens once the run settles successfully.
   */
  it('renders the completed panel', async () => {
    mountPanel(
      stubClient({
        startRun: async () =>
          streamOf([
            { type: 'run-accepted', runToken: 'tok' },
            {
              type: 'run-started',
              runNumber: 219,
              flowName: 'publication',
              startId: 'start1',
              nodeCount: 2,
            },
            { type: 'run-settled', report: REPORT },
          ]),
      }),
    )
    await runFromPanel()

    await waitFor(() => expect(screen.getByTestId('run-rerun-button')).toBeInTheDocument())
    expect(screen.getByTestId('run-log-label').textContent).toBe('Log')
  })

  it('adds no wrapper of its own, so the dock body keeps supplying the padding and gap', async () => {
    mountPanel(
      stubClient(),
      <RunDock entryNodeId="start1" onCollapse={() => {}}>
        <RunPanel />
      </RunDock>,
    )

    await waitFor(() => expect(screen.getByTestId('run-panel-note')).toBeInTheDocument())
    const body = screen.getByTestId('studio-dock-body')
    // The note is a DIRECT child of the dock body: no fragment wrapper sits between them.
    expect(screen.getByTestId('run-panel-note').parentElement).toBe(body)
  })

  it('draws exactly one panel header when it fills the dock', async () => {
    mountPanel(
      stubClient({
        startRun: async () =>
          streamOf([
            { type: 'run-accepted', runToken: 'tok' },
            {
              type: 'run-started',
              runNumber: 220,
              flowName: 'publication',
              startId: 'start1',
              nodeCount: 2,
            },
            { type: 'run-settled', report: FAILED_REPORT },
          ]),
      }),
      <RunDock entryNodeId="start1" onCollapse={() => {}}>
        <RunPanel />
      </RunDock>,
    )
    await runFromPanel()

    await waitFor(() => expect(screen.getByTestId('run-error-name')).toBeInTheDocument())
    expect(screen.queryByTestId('run-state-header')).toBeNull()
  })
})

describe('RunPanelCard', () => {
  it('draws the card of the states artboard, header and body', () => {
    render(<RunPanelCard state={RUNNING} entryNodeId="start1" />)
    expect(screen.getByTestId('run-panel-card')).toBeInTheDocument()
    expect(screen.getByTestId('run-panel-card-body')).toBeInTheDocument()
    expect(screen.getByTestId('run-state-header')).toBeInTheDocument()
    expect(screen.getByTestId('run-progress-bar')).toBeInTheDocument()
  })

  /** The card artboard's running body is the bar and the compact timings, not the docked rows. */
  it('draws the running state as the card artboard, not as the dock', () => {
    render(<RunPanelCard state={RUNNING} entryNodeId="start1" />)
    expect(screen.queryByTestId('run-node-rows')).toBeNull()
    expect(screen.queryByTestId('run-progress-summary')).toBeNull()
    expect(screen.getByTestId('run-timing-name-render').textContent).toBe('render')
  })

  /** The error tint is the failed card's only mark, and it is now a class. Hold the branch. */
  it('frames a failed card differently from a settled one', () => {
    render(<RunPanelCard state={COMPLETED} entryNodeId="start1" />)
    const settled = screen.getByTestId('run-panel-card').className
    cleanup()
    render(<RunPanelCard state={FAILED} entryNodeId="start1" />)
    expect(screen.getByTestId('run-panel-card').className).not.toBe(settled)
  })
})
