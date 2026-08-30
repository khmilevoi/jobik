import type { FlowDocument } from '@jobik/core'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JobikClient, RunStreamEvent, WireRunReportPayload } from '../client/index.js'
import { JobikServerError } from '../client/index.js'
import { StudioApp } from './StudioApp.js'

afterEach(cleanup)

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
    assetUrl: (descriptor) => `/api/assets/${descriptor.id}`,
    extensionBundleUrl: () => '/api/flows/publication/ui.js',
    ...overrides,
  }
}

function mount(client: JobikClient) {
  return render(<StudioApp client={client} externals={{}} importModule={async () => ({})} />)
}

describe('the loaded Studio', () => {
  it('names the flow and its document file in the top bar', async () => {
    mount(stubClient())

    await waitFor(() =>
      expect(screen.getByTestId('studio-top-bar').textContent).toContain('publication'),
    )
    expect(screen.getByTestId('studio-top-bar').textContent).toContain('flow.jobik.json')
  })

  it('lists the flow, its nodes and its inventory in the sidebar', async () => {
    mount(stubClient())

    await waitFor(() =>
      expect(screen.getByTestId('studio-flow-row-publication')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('studio-node-row-start1')).toBeInTheDocument()
    expect(screen.getByTestId('studio-node-row-render')).toBeInTheDocument()
    expect(screen.getByTestId('studio-inventory-row-imageOut')).toBeInTheDocument()
  })

  it('draws both node cards on the canvas', async () => {
    mount(stubClient())

    await waitFor(() => expect(screen.getByTestId('node-card-start1')).toBeInTheDocument())
    expect(screen.getByTestId('node-card-render')).toBeInTheDocument()
  })

  it('shows no unsaved-changes dot on a freshly loaded flow', async () => {
    mount(stubClient())

    await waitFor(() => expect(screen.getByTestId('studio-top-bar')).toBeInTheDocument())
    expect(screen.queryByTestId('studio-dirty')).toBeNull()
  })

  it('opens on the idle run panel with a control per start input field', async () => {
    mount(stubClient())

    await waitFor(() => expect(screen.getByTestId('run-input-title')).toBeInTheDocument())
    expect(screen.getByTestId('run-start-button')).toBeInTheDocument()
  })
})

describe('running from the panel', () => {
  it('streams to a completed panel showing the run number and the outputs', async () => {
    mount(
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

    await waitFor(() => expect(screen.getByTestId('run-input-title')).toBeInTheDocument())
    await userEvent.type(screen.getByTestId('run-input-title'), 'A post')
    await userEvent.click(screen.getByTestId('run-start-button'))

    await waitFor(() => expect(screen.getByTestId('run-outputs-label')).toBeInTheDocument())
    expect(screen.getByTestId('run-panel-card').textContent).toContain('219')
    expect(screen.getByTestId('run-output-name-image')).toBeInTheDocument()
  })

  it('shows the running chip and locks Validate and Save while in flight', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    mount(
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
            await gate
            yield { type: 'run-settled', report: REPORT } as RunStreamEvent
          })(),
      }),
    )

    await waitFor(() => expect(screen.getByTestId('run-input-title')).toBeInTheDocument())
    await userEvent.type(screen.getByTestId('run-input-title'), 'A post')
    await userEvent.click(screen.getByTestId('run-start-button'))

    await waitFor(() => expect(screen.getByTestId('studio-running-chip')).toBeInTheDocument())
    expect(screen.getByTestId('studio-top-bar-actions')).toHaveStyle({ opacity: '0.45' })
    expect(screen.getByText('Validate').closest('button')).toBeDisabled()
    expect(screen.getByText('Save').closest('button')).toBeDisabled()

    release()
    await waitFor(() => expect(screen.queryByTestId('studio-running-chip')).toBeNull())
  })

  it('cancels from the chip', async () => {
    const cancelRun = vi.fn(async () => true as const)
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    mount(
      stubClient({
        cancelRun,
        startRun: async () =>
          (async function* () {
            yield { type: 'run-accepted', runToken: 'tok-9' } as RunStreamEvent
            await gate
            yield {
              type: 'run-settled',
              report: { ...REPORT, status: 'cancelled' as const },
            } as RunStreamEvent
          })(),
      }),
    )

    await waitFor(() => expect(screen.getByTestId('run-input-title')).toBeInTheDocument())
    await userEvent.type(screen.getByTestId('run-input-title'), 'A post')
    await userEvent.click(screen.getByTestId('run-start-button'))
    await waitFor(() => expect(screen.getByTestId('studio-running-cancel')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('studio-running-cancel'))

    expect(cancelRun).toHaveBeenCalledWith('tok-9')
    release()
  })

  it('renders the failed panel with the tag and message the server sent', async () => {
    const failed = {
      ...REPORT,
      status: 'failed' as const,
      nodes: [
        REPORT.nodes[0],
        {
          nodeId: 'render',
          status: 'failed' as const,
          elapsedMs: 800,
          output: null,
          assets: {},
          error: {
            _tag: 'ImageRenderError',
            message: 'Unsupported colour profile in the inlined asset.',
            authored: true,
          },
        },
      ],
    }
    mount(
      stubClient({
        startRun: async () =>
          streamOf([
            { type: 'run-accepted', runToken: 'tok' },
            { type: 'run-settled', report: failed as never },
          ]),
      }),
    )

    await waitFor(() => expect(screen.getByTestId('run-input-title')).toBeInTheDocument())
    await userEvent.type(screen.getByTestId('run-input-title'), 'A post')
    await userEvent.click(screen.getByTestId('run-start-button'))

    await waitFor(() => expect(screen.getByTestId('run-error-name')).toBeInTheDocument())
    expect(screen.getByTestId('run-error-name').textContent).toBe('ImageRenderError')
    expect(screen.getByTestId('run-error-node').textContent).toContain('render')
    expect(screen.getByTestId('run-error-message').textContent).toContain(
      'Unsupported colour profile',
    )
  })
})

describe('saving', () => {
  it('offers reload and copy-draft on a revision conflict and never overwrites', async () => {
    const save = vi.fn(
      async () =>
        new JobikServerError({
          reason: 'changed on disk',
          status: 409,
          payload: {
            _tag: 'FlowRevisionConflictError',
            message: 'changed on disk',
            expectedRevision: 'rev-1',
            actualRevision: 'rev-9',
          },
        }),
    )
    mount(stubClient({ save }))

    await waitFor(() => expect(screen.getByTestId('studio-top-bar')).toBeInTheDocument())
    await userEvent.click(screen.getByText('Save').closest('button') as HTMLElement)

    await waitFor(() => expect(screen.getByTestId('studio-conflict-chip')).toBeInTheDocument())
    expect(screen.getByTestId('studio-conflict-reload')).toBeInTheDocument()
    expect(screen.getByTestId('studio-conflict-copy')).toBeInTheDocument()
    expect(save).toHaveBeenCalledTimes(1)
  })
})

describe('the collapsed layout', () => {
  it('docks the flows control and the run control into the top bar, wired to the real actions', async () => {
    mount(stubClient())
    await waitFor(() => expect(screen.getByTestId('studio-sidebar')).toBeInTheDocument())

    await userEvent.click(screen.getByLabelText('Collapse flows and nodes'))
    await userEvent.click(screen.getByLabelText('Collapse run panel'))

    expect(screen.queryByTestId('studio-sidebar')).toBeNull()
    expect(screen.queryByTestId('studio-dock')).toBeNull()
    expect(screen.getByTestId('studio-docked-run').textContent).toContain('start1')
    expect(screen.getByTestId('node-card-start1')).toBeInTheDocument()
  })
})
