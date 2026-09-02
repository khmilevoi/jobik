import type { FlowDocument } from '@jobik/core'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JobikClient, RunStreamEvent, WireRunReportPayload } from '#client/index.js'
import { JobikServerError, JobikTransportError } from '#client/index.js'
import { dragNode } from '#studio/canvasDragTestSupport.js'
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
  it('names the flow and the file it is authored in in the top bar', async () => {
    mount(stubClient())

    await waitFor(() =>
      expect(screen.getByTestId('studio-top-bar').textContent).toContain('publication'),
    )
    // The badge is the authoring source, never the document: `3C`'s findings cite `flow.ts:41`,
    // so the badge and the findings have to name the same file.
    expect(screen.getByTestId('studio-top-bar').textContent).toContain('flow.ts')
    expect(screen.getByTestId('studio-top-bar').textContent).not.toContain('flow.jobik.json')
  })

  it('lists the flow, its nodes and its inventory in the sidebar', async () => {
    mount(stubClient())

    await waitFor(() =>
      expect(screen.getByTestId('studio-flow-row-publication')).toBeInTheDocument(),
    )
    expect(screen.getByTestId('studio-start-row-start1')).toBeInTheDocument()
    expect(screen.getByTestId('studio-node-row-render')).toBeInTheDocument()
    expect(screen.getByTestId('studio-inventory-row-imageOut')).toBeInTheDocument()
  })

  it('draws both node cards and the one connecting edge on the canvas', async () => {
    const { container } = mount(stubClient())

    await waitFor(() => expect(screen.getByTestId('node-card-start1')).toBeInTheDocument())
    expect(screen.getByTestId('node-card-render')).toBeInTheDocument()
    // `ResizeObserver` is mocked and fires on a macrotask (vitest.setup.ts); React Flow does not
    // draw an edge until both its endpoints have been measured.
    await waitFor(() => expect(container.querySelectorAll('.react-flow__edge')).toHaveLength(1))
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
  it('streams to a completed panel showing the outputs, docked with no nested card', async () => {
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

    // `2A`'s completed panel: node timings, the inputs still editable, `Re-run start1`, then the
    // `Log` block — with `Run panel — states`' `Outputs` group between the inputs and the primary.
    // R8: the group is drawn from the report, and `model/runPanel.ts`'s completed branch says why
    // both artboards are honoured rather than one. `start1`'s own output is the run's input and is
    // not listed twice; `render`'s asset is.
    await waitFor(() => expect(screen.getByTestId('run-rerun-button')).toBeInTheDocument())
    expect(screen.getByTestId('run-log-label')).toHaveTextContent('Log')
    expect(screen.getByTestId('run-log-follow')).toHaveTextContent('tail')
    expect(screen.getByTestId('run-input-title')).toBeInTheDocument()
    expect(screen.getByTestId('run-outputs-label')).toHaveTextContent('Outputs')
    expect(screen.getByTestId('run-output-name-image')).toHaveTextContent('image')
    expect(screen.queryByTestId('run-output-name-title')).toBeNull()
    // R30: `RunDock` already draws the dock's one header; `Studio`'s `runPanel` must be `RunPanel`
    // (no header, no card frame), never the standalone `RunPanelCard` — which would stack a second
    // header and a fixed-size card inside the dock.
    expect(screen.queryByTestId('run-panel-card')).toBeNull()
    expect(screen.queryByTestId('run-state-header')).toBeNull()
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

    // `3C`: the chip asks first. Clicking `Cancel` opens `Cancel run #N?` and cancels nothing;
    // only the dialog's own destructive primary reaches the server.
    await userEvent.click(screen.getByTestId('studio-running-cancel'))
    expect(cancelRun).not.toHaveBeenCalled()

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Cancel run #')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel run' }))

    expect(cancelRun).toHaveBeenCalledWith('tok-9')
    release()
  })

  it('opens the Validation dialog on a rejected document and stays quiet on a valid one', async () => {
    mount(
      stubClient({
        validate: async () => ({
          valid: false,
          error: {
            _tag: 'ConnectionError',
            message: 'render.markdown expects string',
            nodeId: 'render',
          },
        }),
      }),
    )

    await waitFor(() => expect(screen.getByTestId('studio-top-bar')).toBeInTheDocument())
    expect(screen.queryByRole('dialog')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Validate' }))

    const dialog = await screen.findByRole('dialog')
    // The server's own tag and its own words, never re-humanised.
    expect(dialog).toHaveTextContent('ConnectionError')
    expect(dialog).toHaveTextContent('render.markdown expects string')
  })

  it('draws no dialog when the document validates', async () => {
    // No artboard draws an all-clear dialog, and the wire sends no findings to fill one, so a
    // passing check stays as quiet as it was before `3C` existed.
    mount(stubClient())

    await waitFor(() => expect(screen.getByTestId('studio-top-bar')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('keeps the run alive when the cancel dialog is dismissed', async () => {
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
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep running' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(cancelRun).not.toHaveBeenCalled()
    expect(screen.getByTestId('studio-running-cancel')).toBeInTheDocument()
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
            { type: 'run-settled', report: failed },
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

  it('keeps the input that produced the failure visible and editable on the failed panel', async () => {
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
            { type: 'run-settled', report: failed },
          ]),
      }),
    )

    await waitFor(() => expect(screen.getByTestId('run-input-title')).toBeInTheDocument())
    await userEvent.type(screen.getByTestId('run-input-title'), 'A post')
    await userEvent.click(screen.getByTestId('run-start-button'))

    await waitFor(() => expect(screen.getByTestId('run-error-name')).toBeInTheDocument())
    expect(screen.getByTestId('run-input-title')).toHaveValue('A post')

    await userEvent.type(screen.getByTestId('run-input-title'), ', edited')
    expect(screen.getByTestId('run-input-title')).toHaveValue('A post, edited')
  })

  it('shows the running panel note transcribed from the artboard', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    mount(
      stubClient({
        startRun: async () =>
          (async function* () {
            yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
            await gate
            yield { type: 'run-settled', report: REPORT } as RunStreamEvent
          })(),
      }),
    )

    await waitFor(() => expect(screen.getByTestId('run-input-title')).toBeInTheDocument())
    await userEvent.type(screen.getByTestId('run-input-title'), 'A post')
    await userEvent.click(screen.getByTestId('run-start-button'))

    await waitFor(() =>
      expect(screen.getByTestId('run-panel-note').textContent).toBe(
        'Streaming output as each node settles. Inputs are locked for the duration of the run.',
      ),
    )

    release()
  })

  // R38: `## Verification` names the live log; nothing streamed a `node-log` event through
  // `StudioApp` before this.
  it('streams a node-log event into the running panel', async () => {
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
              type: 'node-log',
              line: { nodeId: 'render', message: 'layout pass complete', at: 0 },
            } as RunStreamEvent
            await gate
            yield { type: 'run-settled', report: REPORT } as RunStreamEvent
          })(),
      }),
    )

    await waitFor(() => expect(screen.getByTestId('run-input-title')).toBeInTheDocument())
    await userEvent.type(screen.getByTestId('run-input-title'), 'A post')
    await userEvent.click(screen.getByTestId('run-start-button'))

    await waitFor(() =>
      expect(screen.getByTestId('run-log-line-0').textContent).toContain(
        'render layout pass complete',
      ),
    )

    release()
  })
})

// R35: the top-bar/docked Run control, `⌘↵` and a failed panel's `Re-run` used to hand-roll input
// collection as `Object.entries(draft).filter(v !== '')`, which can only ever produce strings. A
// `number` field crossed the wire as `"1024"`, a `json` field as its raw unparsed text. Every other
// fixture in this file is string-only, which is exactly why nothing caught it: this fixture is not.
describe('R35: a run started outside the idle panel button sends schema-valid values', () => {
  const NUMERIC_DESCRIPTOR = {
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
              field: 'count',
              required: true,
              annotation: 'number',
              control: { kind: 'number' as const, integer: false },
            },
            {
              field: 'payload',
              required: true,
              annotation: 'unknown',
              control: { kind: 'json' as const, schema: {} },
            },
          ],
        },
        output: { nodeId: 'start1', fields: [] },
      },
    ],
  }

  const NUMERIC_DOCUMENT = {
    format: 'jobik.flow',
    version: 1,
    connections: [],
    literals: {},
    layout: { start1: { x: 56, y: 248 } },
  } as unknown as FlowDocument

  it('sends a real number and parsed JSON to the client through ⌘↵, not raw draft strings', async () => {
    const startRun = vi.fn(async (_args: { flowId: string; startId: string; input: unknown }) =>
      streamOf([{ type: 'run-accepted', runToken: 'tok' }]),
    )
    mount(
      stubClient({
        loadFlow: async () => ({
          descriptor: NUMERIC_DESCRIPTOR,
          document: NUMERIC_DOCUMENT,
          revision: 'rev-1',
        }),
        startRun,
      }),
    )

    await waitFor(() => expect(screen.getByTestId('run-input-count')).toBeInTheDocument())
    await userEvent.type(screen.getByTestId('run-input-count'), '1024')
    // `{` is `userEvent.type`'s own key-descriptor syntax; `{{` types it literally. A bare `}`
    // outside an unclosed `{` needs no escaping.
    await userEvent.type(screen.getByTestId('run-input-payload'), '{{"a":1}')

    await userEvent.keyboard('{Control>}{Enter}{/Control}')

    await waitFor(() => expect(startRun).toHaveBeenCalledTimes(1))
    const args = startRun.mock.calls[0]?.[0] as { input: Record<string, unknown> }
    expect(args.input).toEqual({ count: 1024, payload: { a: 1 } })
  })
})

// R32: `runPanelState` reads `session.failure` — the surface every run failure now arrives on,
// including these two, which never produce a `report` at all. Both must fail against a
// `runPanelState` that ignores `session.failure` and only reaches the failed panel through a
// `run-settled` report.
describe('a run failure that never produces a report', () => {
  it('renders the failed panel from a rejected start, with an empty node id', async () => {
    mount(
      stubClient({
        startRun: async () => new JobikTransportError({ url: '/api/flows/publication/run' }),
      }),
    )

    await waitFor(() => expect(screen.getByTestId('run-input-title')).toBeInTheDocument())
    await userEvent.type(screen.getByTestId('run-input-title'), 'A post')
    await userEvent.click(screen.getByTestId('run-start-button'))

    await waitFor(() => expect(screen.getByTestId('run-error-name')).toBeInTheDocument())
    expect(screen.getByTestId('run-error-name').textContent).toBe('JobikTransportError')
    expect(screen.getByTestId('run-error-node').textContent).toBe('')
    expect(screen.getByTestId('run-error-message').textContent).toContain(
      'The Jobik server could not be reached',
    )
  })

  it('renders the failed panel when the stream drops with no terminal event', async () => {
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
          ]),
      }),
    )

    await waitFor(() => expect(screen.getByTestId('run-input-title')).toBeInTheDocument())
    await userEvent.type(screen.getByTestId('run-input-title'), 'A post')
    await userEvent.click(screen.getByTestId('run-start-button'))

    await waitFor(() => expect(screen.getByTestId('run-error-name')).toBeInTheDocument())
    expect(screen.getByTestId('run-error-name').textContent).toBe('Error')
    expect(screen.getByTestId('run-error-node').textContent).toBe('')
    expect(screen.getByTestId('run-error-message').textContent).toContain(
      'connection to the server closed',
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

  // R36: every non-409 save failure produced `saveState.kind === 'error'` and rendered nothing —
  // Save silently did nothing visible and the user believed the file was written. `## Verification`
  // names save failures explicitly.
  it('renders the server’s own message on a non-conflict save failure', async () => {
    const save = vi.fn(
      async () =>
        new JobikServerError({
          reason: 'disk is full',
          status: 500,
          payload: { _tag: 'FlowWriteError', message: 'disk is full' },
        }),
    )
    mount(stubClient({ save }))

    await waitFor(() => expect(screen.getByTestId('studio-top-bar')).toBeInTheDocument())
    await userEvent.click(screen.getByText('Save').closest('button') as HTMLElement)

    await waitFor(() => expect(screen.getByTestId('studio-save-error-chip')).toBeInTheDocument())
    // Never re-humanised: exactly the server's own `.payload.message`.
    expect(screen.getByTestId('studio-save-error-message').textContent).toBe('disk is full')
    expect(save).toHaveBeenCalledTimes(1)
  })
})

describe('the collapsed layout', () => {
  it('docks the flows control and the run control into the top bar, wired to the real actions', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    mount(
      stubClient({
        startRun: async () =>
          (async function* () {
            yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
            await gate
            yield { type: 'run-settled', report: REPORT } as RunStreamEvent
          })(),
      }),
    )
    await waitFor(() => expect(screen.getByTestId('studio-sidebar')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByTestId('run-input-title')).toBeInTheDocument())
    await userEvent.type(screen.getByTestId('run-input-title'), 'A post')

    await userEvent.click(screen.getByLabelText('Collapse flows and nodes'))
    await userEvent.click(screen.getByLabelText('Collapse run panel'))

    // `4A` keeps a collapsed panel mounted so its container's width can ease; the slot goes
    // `aria-hidden` and `inert` instead, so nothing inside it is reachable or announced.
    expect(screen.getByTestId('studio-left-panel')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByTestId('studio-right-panel')).toHaveAttribute('aria-hidden', 'true')
    const dockedRun = screen.getByTestId('studio-docked-run')
    expect(dockedRun.textContent).toContain('start1')
    expect(screen.getByTestId('node-card-start1')).toBeInTheDocument()

    // Asserting the docked control's own text would pass even with `onRun` unwired. Click its
    // `Run` button and confirm a real run actually starts.
    await userEvent.click(within(dockedRun).getByRole('button', { name: 'Run' }))
    await waitFor(() => expect(screen.getByTestId('studio-running-chip')).toBeInTheDocument())

    release()
    await waitFor(() => expect(screen.queryByTestId('studio-running-chip')).toBeNull())
  })
})

// R33: `onCopyAll` and `onDownload` were both wired to `closeViewer` — neither did what its label
// said, and closing the viewer required pressing the button labelled "Copy all". The `Output
// viewer` artboard (design lines 484–491) draws `Preview | Raw | Logs`, the source field, and
// `Copy all` / `Download` — no close control of its own, so `Escape` is what this plan adds.
describe('the output viewer', () => {
  /** Mounts, runs `start1` to a settled report, and touches the dock in no way at all. */
  async function runToSettled() {
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
    await waitFor(() =>
      expect(
        within(screen.getByTestId('node-card-render')).getByTestId('node-output-inspect'),
      ).toBeInTheDocument(),
    )
  }

  /**
   * G4. `2A`'s subtitle is *"output dock is dismissable (× or esc)"*, and dismissable implies
   * restorable — the strip is the restore. It used to be mounted only after a manual collapse, so
   * a settled run's output was reachable from a card's `inspect` link and from nowhere else.
   */
  it('raises 2A’s closed strip once a run settles, without opening the dock', async () => {
    await runToSettled()

    expect(screen.getByTestId('output-dock-strip')).toBeInTheDocument()
    expect(screen.getByTestId('output-dock-summary').textContent).toContain('run #219')
    // Not an auto-open: `DEFERRED.md` keeps the dock a deliberate act.
    expect(screen.queryByTestId('output-dock')).toBeNull()
  })

  it('opens the dock from the strip’s own Show output', async () => {
    await runToSettled()
    await userEvent.click(screen.getByTestId('output-dock-show'))

    await waitFor(() => expect(screen.getByTestId('output-dock')).toBeInTheDocument())
    expect(screen.queryByTestId('output-dock-strip')).toBeNull()
  })

  it('draws no strip before anything has run', async () => {
    mount(stubClient({}))
    await waitFor(() => expect(screen.getByTestId('studio-sidebar')).toBeInTheDocument())

    expect(screen.queryByTestId('output-dock-strip')).toBeNull()
    expect(screen.queryByTestId('output-dock')).toBeNull()
  })

  async function openViewer() {
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

    // `2A`: the dock is opened from the settled card's own `inspect`, not from the run panel —
    // the panel no longer lists outputs at all.
    await waitFor(() =>
      expect(
        within(screen.getByTestId('node-card-render')).getByTestId('node-output-inspect'),
      ).toBeInTheDocument(),
    )
    await userEvent.click(
      within(screen.getByTestId('node-card-render')).getByTestId('node-output-inspect'),
    )
    await waitFor(() => expect(screen.getByTestId('output-dock')).toBeInTheDocument())
  }

  it('wires Copy all to the clipboard, not to closing', async () => {
    const writeText = vi.fn(async (_text: string) => {})
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    await openViewer()
    await userEvent.click(screen.getByText('Copy all'))

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText.mock.calls[0]?.[0]).toContain('"runNumber": 219')
    expect(screen.getByTestId('output-dock')).toBeInTheDocument()
  })

  // R38: this used to assert only that the viewer stayed open, which passes even against an empty
  // `onDownload` — the exact vacuous-test class this plan kept shipping. `URL.createObjectURL` is
  // stubbed rather than relied on natively, so the assertion is deterministic regardless of jsdom's
  // own support for it.
  it('wires Download to a real download, not to closing', async () => {
    const objectUrl = 'blob:mock-download-url'
    const createObjectURL = vi.fn((_blob: Blob) => objectUrl)
    const revokeObjectURL = vi.fn((_url: string) => {})
    const originalCreate = globalThis.URL.createObjectURL
    const originalRevoke = globalThis.URL.revokeObjectURL
    globalThis.URL.createObjectURL = createObjectURL as typeof globalThis.URL.createObjectURL
    globalThis.URL.revokeObjectURL = revokeObjectURL as typeof globalThis.URL.revokeObjectURL

    try {
      await openViewer()
      await userEvent.click(screen.getByText('Download'))

      expect(createObjectURL).toHaveBeenCalledTimes(1)
      const blob = createObjectURL.mock.calls[0]?.[0] as Blob
      expect(blob.type).toBe('application/json')
      expect(revokeObjectURL).toHaveBeenCalledWith(objectUrl)
      expect(screen.getByTestId('output-dock')).toBeInTheDocument()
    } finally {
      globalThis.URL.createObjectURL = originalCreate
      globalThis.URL.revokeObjectURL = originalRevoke
    }
  })

  it('closes on Escape, the artboard drawing no close control of its own', async () => {
    await openViewer()
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByTestId('output-dock')).toBeNull()
  })

  // R37: `assets.ts:41-42` qualifies a duplicated field name to `${nodeId}.${field}`. `onOpen` used
  // to look the (possibly qualified) label up with `field.field in node.assets`, which can never
  // match once qualification actually fires — `render`'s own `assets` map only ever holds the
  // BARE key `image`. `Open` silently did nothing whenever an asset field collided by name with any
  // other node's output field.
  it('opens the right node when an asset field name collides with another node’s output field', async () => {
    const qualifiedReport: WireRunReportPayload = {
      ...REPORT,
      nodes: [
        ...REPORT.nodes,
        {
          nodeId: 'publish',
          status: 'ok' as const,
          elapsedMs: 50,
          // Also named `image`, but as a plain string output — never an asset — so the two fields
          // collide by name across nodes and both get qualified to `render.image` / `publish.image`.
          output: { image: 'not a binary field, just a string that happens to share the name' },
          assets: {},
          error: null,
        },
      ],
    }

    mount(
      stubClient({
        startRun: async () =>
          streamOf([
            { type: 'run-accepted', runToken: 'tok' },
            { type: 'run-settled', report: qualifiedReport },
          ]),
      }),
    )

    await waitFor(() => expect(screen.getByTestId('run-input-title')).toBeInTheDocument())
    await userEvent.type(screen.getByTestId('run-input-title'), 'A post')
    await userEvent.click(screen.getByTestId('run-start-button'))

    // Two nodes both have an `image` output — `render`'s is the asset, `publish`'s a string. The
    // dock is opened from the card itself, so the node is never inferred from a field label and
    // the collision cannot mis-route it.
    await waitFor(() =>
      expect(
        within(screen.getByTestId('node-card-render')).getByTestId('node-output-inspect'),
      ).toBeInTheDocument(),
    )
    await userEvent.click(
      within(screen.getByTestId('node-card-render')).getByTestId('node-output-inspect'),
    )

    await waitFor(() => expect(screen.getByTestId('output-dock')).toBeInTheDocument())
    // Opened `render` (the asset descriptor's own id), never `publish` (the string).
    expect(screen.getByTestId('output-viewer-panel').textContent).toContain('asset-1')
    expect(screen.getByTestId('output-viewer-panel').textContent).not.toContain(
      'not a binary field',
    )
  })
})

/**
 * Closeout finding 1 and 8-A: three treatments the artboards fix that only ever existed against
 * fixtures. Every assertion below runs against a REAL `StudioApp` driven by a real stream — the
 * layer the audit found never builds them.
 */
describe('the treatments a real run builds', () => {
  function gatedRun() {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const client = stubClient({
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
    })
    return { client, release: () => release() }
  }

  async function startRun(client: JobikClient) {
    mount(client)
    await waitFor(() => expect(screen.getByTestId('run-input-title')).toBeInTheDocument())
    await userEvent.type(screen.getByTestId('run-input-title'), 'A post')
    await userEvent.click(screen.getByTestId('run-start-button'))
  }

  // `Node states` queued (design 671–676): `Waiting on render.image` over three flat bars. The
  // upstream `node.field` comes from the document's own connection list — here `start1.title`.
  it('gives a queued node the Waiting on line and the three placeholder bars', async () => {
    const { client, release } = gatedRun()
    await startRun(client)

    await waitFor(() => {
      const card = screen.getByTestId('node-card-render')
      expect(within(card).getByTestId('node-waiting-on')).toHaveTextContent(
        'Waiting on start1.title',
      )
    })
    const card = screen.getByTestId('node-card-render')
    expect(within(card).getAllByTestId('node-placeholder-bar')).toHaveLength(3)
    // `start1` has no incoming connection, so there is nothing honest to name: no line at all.
    expect(
      within(screen.getByTestId('node-card-start1')).queryByTestId('node-waiting-on'),
    ).toBeNull()

    release()
  })

  // `Studio — default` ok (design 204–208): the inline slot's caption row is the mono metadata
  // row, beside the flow-local component the slot already holds. Only what the `AssetDescriptor`
  // carries — the artboard's `1024×1024` is a dimension no descriptor has.
  it('captions a settled ok node with the descriptor’s own mime and size', async () => {
    mount(
      stubClient({
        startRun: async () =>
          streamOf([
            { type: 'run-accepted', runToken: 'tok' },
            { type: 'run-settled', report: REPORT },
          ]),
      }),
    )
    await waitFor(() => expect(screen.getByTestId('run-input-title')).toBeInTheDocument())
    await userEvent.type(screen.getByTestId('run-input-title'), 'A post')
    await userEvent.click(screen.getByTestId('run-start-button'))

    await waitFor(() => {
      const card = screen.getByTestId('node-card-render')
      expect(within(card).getByTestId('node-output-caption')).toHaveTextContent('png · 402 kb')
    })
    const card = screen.getByTestId('node-card-render')
    // `2A` replaces `Studio — default`'s producing-node name with an accent `inspect` that opens
    // the output dock. The two artboards never draw both, and the newer one wins.
    expect(within(card).getByTestId('node-output-inspect')).toHaveTextContent('inspect')
    expect(within(card).getByTestId('node-output-caption').textContent).not.toContain('×')
  })

  // 8-A: `Studio — run in progress` (592) replaces the dock header's chevron with the run number;
  // the standalone settled cards (801, 838) add the elapsed after it.
  it('replaces the dock header’s chevron with the run number, then the settled meta', async () => {
    const { client, release } = gatedRun()
    await startRun(client)

    await waitFor(() => expect(screen.getByTestId('studio-dock-run-meta').textContent).toBe('#219'))
    expect(screen.queryByLabelText('Collapse run panel')).toBeNull()

    release()
    await waitFor(() =>
      expect(screen.getByTestId('studio-dock-run-meta').textContent).toBe('#219 · 2.4s'),
    )
    // Never a second header: `RunPanel` returns a fragment and the dock owns the one header.
    expect(screen.queryByTestId('run-state-header')).toBeNull()
  })

  it('heads the idle dock with the chevron and no run number', async () => {
    mount(stubClient())
    await waitFor(() => expect(screen.getByTestId('run-input-title')).toBeInTheDocument())

    expect(screen.getByLabelText('Collapse run panel')).toBeInTheDocument()
    expect(screen.queryByTestId('studio-dock-run-meta')).toBeNull()
  })
})

/**
 * Artboard `3D`, end to end through the real app.
 *
 * `POST /api/flows/:id/validate` answers with at most one finding, so every count asserted here is
 * `1 error`. The design writes `2 errors, 1 warning` because its board has three findings; a
 * Studio that printed that from one would be lying, and the test is what pins that it does not.
 */
const INVALID = stubClient({
  validate: async () => ({
    valid: false,
    error: {
      _tag: 'ConnectionError',
      message: "required input field 'render.title' is neither connected nor given a literal",
      from: null,
      to: { node: 'render', field: 'title' },
    },
  }),
})

async function validateFrom(client: JobikClient) {
  mount(client)
  await waitFor(() => expect(screen.getByTestId('studio-top-bar')).toBeInTheDocument())
  await userEvent.click(screen.getByTestId('studio-validate'))
}

describe('3D — validate', () => {
  it('draws the status strip on a valid flow, counting what it actually checked', async () => {
    await validateFrom(stubClient())

    const strip = await screen.findByTestId('studio-status-strip')
    expect(strip).toHaveTextContent('No issues')
    // Two nodes and one connection is what DESCRIPTOR and DOCUMENT hold — not the artboard's two.
    expect(screen.getByTestId('studio-status-meta')).toHaveTextContent('2 nodes · 1 connection')
  })

  it('draws no strip at all until a check has answered', async () => {
    mount(stubClient())
    await waitFor(() => expect(screen.getByTestId('studio-top-bar')).toBeInTheDocument())

    expect(screen.queryByTestId('studio-status-strip')).toBeNull()
    expect(screen.queryByTestId('studio-problems-strip')).toBeNull()
  })

  it('replaces it with the problems strip on a rejected flow, counting only what it was sent', async () => {
    await validateFrom(INVALID)

    const strip = await screen.findByTestId('studio-problems-strip')
    expect(screen.queryByTestId('studio-status-strip')).toBeNull()
    // One finding on the wire is one row and one error — never the artboard's `2 errors, 1 warning`.
    expect(screen.getByTestId('studio-problems-count')).toHaveTextContent('1 error')
    expect(screen.getAllByTestId('studio-problem-row')).toHaveLength(1)
    expect(strip).toHaveTextContent('ConnectionError')
  })

  it('says `1 error` on the Validate control and opens the report from it', async () => {
    await validateFrom(INVALID)

    const control = await screen.findByTestId('studio-validate')
    await waitFor(() => expect(control).toHaveTextContent('1 error'))
    expect(within(control).getByTestId('validate-report')).toHaveTextContent('report')

    // The dialog opens with the finding; dismissing it leaves the strip standing.
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByTestId('studio-problems-strip')).toBeInTheDocument()

    // `Open report` puts it back — the findings outlive the dialog.
    await userEvent.click(screen.getByTestId('studio-problems-open-report'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('marks both ends of the failing connection, and nothing else', async () => {
    await validateFrom(INVALID)
    await screen.findByTestId('studio-problems-strip')

    // `render.title` IS connected in DOCUMENT, so the port keeps its declared type and is marked
    // as a mismatch — scoped to the card the finding names, since `start1` has a `title` too.
    const receiving = within(screen.getByTestId('node-card-render')).getByTestId(
      'field-row-target-title',
    )
    expect(within(receiving).getByTestId('field-annotation-problem')).toHaveTextContent('string')

    // The sending end of the same connection is marked as well: `3D` marks the port, its type
    // label, the edge and the node border.
    const sending = within(screen.getByTestId('node-card-start1')).getByTestId(
      'field-row-source-title',
    )
    expect(within(sending).getByTestId('field-annotation-problem')).toBeInTheDocument()

    // `start1` own unconnected input is not part of the finding and stays untouched.
    const untouched = within(screen.getByTestId('node-card-start1')).getByTestId(
      'field-row-target-title',
    )
    expect(within(untouched).queryByTestId('field-annotation-problem')).toBeNull()
  })

  it('says `no source` on a port the document leaves unconnected', async () => {
    await validateFrom(
      stubClient({
        validate: async () => ({
          valid: false,
          error: {
            _tag: 'ConnectionError',
            message: "required input field 'start1.title' is neither connected nor given a literal",
            from: null,
            // Nothing in DOCUMENT connects into `start1`, so this port genuinely has no source —
            // which is the whole difference between the artboard's two failure treatments.
            to: { node: 'start1', field: 'title' },
          },
        }),
      }),
    )
    await screen.findByTestId('studio-problems-strip')

    const row = within(screen.getByTestId('node-card-start1')).getByTestId('field-row-target-title')
    expect(within(row).getByTestId('field-annotation-problem')).toHaveTextContent('no source')
  })

  it('blocks Run while an error stands, and lets it through once the flow is valid again', async () => {
    const startRun = vi.fn(async () => streamOf([{ type: 'run-accepted' as const, runToken: 't' }]))
    await validateFrom(stubClient({ ...INVALID, startRun }))

    await screen.findByTestId('studio-problems-strip')
    const run = within(screen.getByTestId('studio-docked-run')).getByRole('button', { name: 'Run' })
    expect(run).toBeDisabled()

    await userEvent.click(screen.getByTestId('run-start-button'))
    expect(startRun).not.toHaveBeenCalled()
  })

  it('validates from ⌘⇧V', async () => {
    const validate = vi.fn(async () => ({ valid: true }) as const)
    mount(stubClient({ validate }))
    await waitFor(() => expect(screen.getByTestId('studio-top-bar')).toBeInTheDocument())

    await userEvent.keyboard('{Meta>}{Shift>}v{/Shift}{/Meta}')

    await waitFor(() => expect(validate).toHaveBeenCalledTimes(1))
    expect(await screen.findByTestId('studio-status-strip')).toBeInTheDocument()
  })

  it('ignores a second press while the check is still running', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const validate = vi.fn(async () => {
      await gate
      return { valid: true } as const
    })
    mount(stubClient({ validate }))
    await waitFor(() => expect(screen.getByTestId('studio-top-bar')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('studio-validate'))
    await waitFor(() => expect(screen.getByTestId('validate-sweep')).toBeInTheDocument())
    await userEvent.keyboard('{Meta>}{Shift>}v{/Shift}{/Meta}')

    expect(validate).toHaveBeenCalledTimes(1)
    release()
  })
})

/**
 * The config now declares three flows and the Studio could only ever load, run and save the first.
 * These cover the whole switch as the user meets it: the row, the reset, and a run in flight.
 */
const POKEDEX_DOCUMENT = {
  format: 'jobik.flow',
  version: 1,
  connections: [],
  literals: {},
  layout: { byName: { x: 0, y: 0 }, byNumber: { x: 0, y: 140 } },
} as unknown as FlowDocument

/** The repository's only two-start descriptor. Every other fixture declares `['start1']`. */
const POKEDEX_DESCRIPTOR = {
  id: 'pokedex',
  name: 'pokedex',
  documentFile: 'flow.jobik.json',
  sourceFile: 'flow.ts',
  startIds: ['byName', 'byNumber'],
  nodes: [
    {
      id: 'byName',
      kind: 'start' as const,
      title: 'start',
      input: {
        nodeId: 'byName',
        fields: [
          {
            field: 'name',
            required: true,
            annotation: 'string',
            control: { kind: 'string' as const },
          },
        ],
      },
      output: {
        nodeId: 'byName',
        fields: [{ field: 'name', required: true, annotation: 'string' }],
      },
    },
    {
      id: 'byNumber',
      kind: 'start' as const,
      title: 'start',
      input: {
        nodeId: 'byNumber',
        fields: [
          {
            field: 'number',
            required: true,
            annotation: 'number',
            control: { kind: 'number' as const, integer: true },
            default: 25,
          },
        ],
      },
      output: {
        nodeId: 'byNumber',
        fields: [{ field: 'number', required: true, annotation: 'number' }],
      },
    },
  ],
}

function twoFlowClient(overrides: Partial<JobikClient> = {}): JobikClient {
  return stubClient({
    listFlows: async () => [
      { id: 'publication', name: 'publication', nodeCount: 2 },
      { id: 'pokedex', name: 'pokedex', nodeCount: 2 },
    ],
    loadFlow: async (id: string) =>
      id === 'pokedex'
        ? { descriptor: POKEDEX_DESCRIPTOR, document: POKEDEX_DOCUMENT, revision: 'rev-p1' }
        : { descriptor: DESCRIPTOR, document: DOCUMENT, revision: 'rev-1' },
    ...overrides,
  })
}

describe('switching the active flow', () => {
  it('lists every flow and loads the one whose row is pressed', async () => {
    mount(twoFlowClient())
    await waitFor(() => expect(screen.getByTestId('studio-flow-row-pokedex')).toBeInTheDocument())
    expect(screen.getByTestId('studio-top-bar')).toHaveTextContent('publication')

    await userEvent.click(screen.getByTestId('studio-flow-row-pokedex'))

    await waitFor(() => expect(screen.getByTestId('studio-top-bar')).toHaveTextContent('pokedex'))
    // The graph really changed: the previous flow's nodes are gone and this one's are listed —
    // `byName` is one of pokedex's starts, so it is named by the `Start` section, not the list.
    expect(await screen.findByTestId('studio-start-row-byName')).toBeInTheDocument()
    expect(screen.queryByTestId('studio-node-row-render')).toBeNull()
    // `3F` guards a switch that would lose something; a clean draft and no run loses nothing, so
    // the common case never sees a dialog.
    expect(screen.queryByTestId('switch-flow-modal')).toBeNull()
  })

  /**
   * `3E` note 04's blocked list is a list — its `Disabled` column draws the `digest` row and its
   * count at 45%, not an empty container. `flowsBlocked` is raised for exactly the window this
   * test holds open, so if the rows are gone the artboard's one blocked state has nothing left to
   * draw and the user loses the listing on every switch rather than only the row being switched to.
   */
  it('keeps every flow row on screen, blocked, while the switch is in flight', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    mount(
      twoFlowClient({
        loadFlow: async (id: string) => {
          if (id === 'pokedex') await gate
          return id === 'pokedex'
            ? { descriptor: POKEDEX_DESCRIPTOR, document: POKEDEX_DOCUMENT, revision: 'rev-p1' }
            : { descriptor: DESCRIPTOR, document: DOCUMENT, revision: 'rev-1' }
        },
      }),
    )
    await waitFor(() => expect(screen.getByTestId('studio-flow-row-pokedex')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('studio-flow-row-pokedex'))
    await waitFor(() => expect(screen.getByTestId('studio-flow-row-pokedex')).toBeDisabled())

    // Mid-switch: both rows are still listed, and both answer nothing.
    expect(screen.getByTestId('studio-flow-row-publication')).toBeInTheDocument()
    expect(screen.getByTestId('studio-flow-row-publication')).toBeDisabled()

    release()
    await waitFor(() => expect(screen.getByTestId('studio-top-bar')).toHaveTextContent('pokedex'))
    expect(screen.getByTestId('studio-flow-row-pokedex')).toBeEnabled()
  })

  it('drops the previous flow run history, output dock and validation strip', async () => {
    mount(
      twoFlowClient({
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
        validate: async () => ({ valid: true }) as const,
      }),
    )
    await waitFor(() => expect(screen.getByTestId('studio-flow-row-pokedex')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('run-start-button'))
    await waitFor(() => expect(screen.getByTestId('studio-run-row-219')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('studio-validate'))
    await screen.findByTestId('studio-status-strip')

    await userEvent.click(screen.getByTestId('studio-flow-row-pokedex'))

    await waitFor(() => expect(screen.getByTestId('studio-top-bar')).toHaveTextContent('pokedex'))
    expect(screen.queryByTestId('studio-run-row-219')).toBeNull()
    expect(screen.getByText('Inventory')).toBeInTheDocument()
    expect(screen.queryByTestId('studio-status-strip')).toBeNull()
    expect(screen.queryByTestId('studio-problems-strip')).toBeNull()
  })

  it('never paints a run started under the previous flow onto the new one', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    mount(
      twoFlowClient({
        startRun: async () =>
          (async function* () {
            yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
            await gate
            yield {
              type: 'run-started',
              runNumber: 219,
              flowName: 'publication',
              startId: 'start1',
              nodeCount: 2,
            } as RunStreamEvent
            yield { type: 'run-settled', report: REPORT } as RunStreamEvent
          })(),
      }),
    )
    await waitFor(() => expect(screen.getByTestId('studio-flow-row-pokedex')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('run-start-button'))
    await waitFor(() => expect(screen.getByTestId('studio-running-chip')).toBeInTheDocument())

    // `3F`: a run in flight is confirmed rather than walked past, and keeping it running is the
    // primary. The running chip goes with the flow it belonged to.
    await userEvent.click(screen.getByTestId('studio-flow-row-pokedex'))
    await userEvent.click(screen.getByRole('button', { name: 'Switch and keep running' }))
    await waitFor(() => expect(screen.getByTestId('studio-top-bar')).toHaveTextContent('pokedex'))
    expect(screen.queryByTestId('studio-running-chip')).toBeNull()

    release()
    await waitFor(() => expect(screen.getByTestId('studio-start-row-byName')).toBeInTheDocument())

    // The stream ran to its terminal line and none of it reached the new flow's panel.
    expect(screen.queryByTestId('studio-run-row-219')).toBeNull()
    expect(screen.getByTestId('run-start-button')).toHaveTextContent('Run byName')
  })
})

/**
 * Artboard `3F` — the two switches that lose something, and the dialog that stands in front of
 * them. The unguarded switch above stays unguarded; these are the two states that were dropping a
 * draft on the floor and leaving a server-side run with nothing left to cancel it.
 */
describe('3F — switching away from a run in flight', () => {
  async function mountMidRun(overrides: Partial<JobikClient> = {}) {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const view = mount(
      twoFlowClient({
        startRun: async () =>
          (async function* () {
            yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
            yield {
              type: 'run-started',
              runNumber: 221,
              flowName: 'publication',
              startId: 'start1',
              nodeCount: 2,
            } as RunStreamEvent
            await gate
            yield { type: 'run-settled', report: REPORT } as RunStreamEvent
          })(),
        ...overrides,
      }),
    )
    await waitFor(() => expect(screen.getByTestId('studio-flow-row-pokedex')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('run-start-button'))
    await waitFor(() => expect(screen.getByTestId('studio-running-chip')).toBeInTheDocument())
    return { ...view, release }
  }

  it('asks first, on the run body, and stays where it is until it is answered', async () => {
    const { release } = await mountMidRun()

    await userEvent.click(screen.getByTestId('studio-flow-row-pokedex'))

    expect(await screen.findByTestId('switch-flow-modal')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Switch to pokedex?' })).toBeInTheDocument()
    expect(screen.getByTestId('switch-flow-meta')).toHaveTextContent('run #221')
    expect(screen.getByTestId('switch-flow-message')).toHaveTextContent(
      'keeps running on the server',
    )
    expect(screen.getByTestId('modal-hint')).toHaveTextContent('esc stays in publication')
    expect(screen.getByTestId('studio-top-bar')).toHaveTextContent('publication')
    release()
  })

  it('esc stays in the flow and leaves the run alone', async () => {
    const cancelRun = vi.fn(async (_runToken: string) => true as const)
    const { release } = await mountMidRun({ cancelRun })
    await userEvent.click(screen.getByTestId('studio-flow-row-pokedex'))
    await screen.findByTestId('switch-flow-modal')

    fireEvent.keyDown(screen.getByTestId('switch-flow-modal'), { key: 'Escape' })

    await waitFor(() => expect(screen.queryByTestId('switch-flow-modal')).toBeNull())
    expect(screen.getByTestId('studio-top-bar')).toHaveTextContent('publication')
    expect(screen.getByTestId('studio-running-chip')).toBeInTheDocument()
    expect(cancelRun).not.toHaveBeenCalled()
    // The switch dialog is not the cancel dialog: esc out of one must not open the other.
    expect(screen.queryByTestId('cancel-run-modal')).toBeNull()
    release()
  })

  it('`Switch and keep running` switches at once and cancels nothing', async () => {
    const cancelRun = vi.fn(async (_runToken: string) => true as const)
    const { release } = await mountMidRun({ cancelRun })
    await userEvent.click(screen.getByTestId('studio-flow-row-pokedex'))
    await screen.findByTestId('switch-flow-modal')

    await userEvent.click(screen.getByRole('button', { name: 'Switch and keep running' }))

    await waitFor(() => expect(screen.getByTestId('studio-top-bar')).toHaveTextContent('pokedex'))
    expect(screen.queryByTestId('switch-flow-modal')).toBeNull()
    expect(cancelRun).not.toHaveBeenCalled()
    release()
  })

  it('`Cancel and switch` stops the run on the server before it leaves', async () => {
    const cancelRun = vi.fn(async (_runToken: string) => true as const)
    const { release } = await mountMidRun({ cancelRun })
    await userEvent.click(screen.getByTestId('studio-flow-row-pokedex'))
    await screen.findByTestId('switch-flow-modal')

    await userEvent.click(screen.getByRole('button', { name: 'Cancel and switch' }))

    // The token is the one the run was accepted with — the cancel is aimed at the run being left,
    // not at whatever `runTokenRef` holds once the switch has cleared it.
    expect(cancelRun).toHaveBeenCalledWith('tok')
    await waitFor(() => expect(screen.getByTestId('studio-top-bar')).toHaveTextContent('pokedex'))
    expect(screen.queryByTestId('switch-flow-modal')).toBeNull()
    release()
  })
})

describe('3F — switching away from an unsaved draft', () => {
  async function mountDirty(overrides: Partial<JobikClient> = {}) {
    const view = mount(twoFlowClient(overrides))
    await waitFor(() => expect(screen.getByTestId('studio-flow-row-pokedex')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByTestId('node-card-render')).toBeInTheDocument())
    dragNode(view.container, 'render', 64, -24)
    await waitFor(() => expect(screen.getByTestId('studio-dirty')).toBeInTheDocument())
    return view
  }

  it('asks first, on the unsaved body, counting what the draft is holding back', async () => {
    const save = vi.fn(async (_id: string, _document: FlowDocument, _revision: string) => ({
      revision: 'rev-2',
    }))
    await mountDirty({ save })

    await userEvent.click(screen.getByTestId('studio-flow-row-pokedex'))

    expect(await screen.findByTestId('switch-flow-modal')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Switch to pokedex?' })).toBeInTheDocument()
    expect(screen.getByTestId('switch-flow-meta')).toHaveTextContent('1 unsaved change')
    expect(screen.getByTestId('switch-flow-message')).toHaveTextContent('flow.jobik.json')
    expect(screen.getByTestId('studio-top-bar')).toHaveTextContent('publication')
    expect(save).not.toHaveBeenCalled()
  })

  /**
   * The dialog above painted *bare* in a real browser — serif text, no card, no scrim, the copy
   * lying straight on the canvas — while every assertion in this file passed.
   *
   * Every `--jbk-*` custom property (`tokens.css` and each directory's `*Tokens.css`) and the reset
   * that sets the UI font stack are declared under `[data-jobik-studio]`, and `StudioApp` renders
   * its dialogs as siblings of `<Studio />` — outside `StudioFrame`, which used to be that
   * attribute's only carrier. Nothing resolved.
   *
   * jsdom evaluates no CSS, so appearance is not assertable here and asserting it would only
   * restate the stylesheet. The *structure* the appearance depends on is assertable, and this is
   * it: an open dialog must sit in a token scope. `ModalShell` marks its own root, so `closest`
   * finds the dialog itself; a modal nested inside the frame would satisfy this too. Either way it
   * is styled, and outside every scope it is not. All five `3C`/`3F` dialogs share `ModalShell`,
   * so this one covers the mechanism behind every one of them.
   */
  it('opens the dialog inside a `data-jobik-studio` token scope', async () => {
    await mountDirty()
    await userEvent.click(screen.getByTestId('studio-flow-row-pokedex'))

    const modal = await screen.findByTestId('switch-flow-modal')
    expect(modal.closest('[data-jobik-studio]')).not.toBeNull()
  })

  it('esc stays in the flow and leaves the draft dirty', async () => {
    const save = vi.fn(async (_id: string, _document: FlowDocument, _revision: string) => ({
      revision: 'rev-2',
    }))
    await mountDirty({ save })
    await userEvent.click(screen.getByTestId('studio-flow-row-pokedex'))
    await screen.findByTestId('switch-flow-modal')

    fireEvent.keyDown(screen.getByTestId('switch-flow-modal'), { key: 'Escape' })

    await waitFor(() => expect(screen.queryByTestId('switch-flow-modal')).toBeNull())
    expect(screen.getByTestId('studio-top-bar')).toHaveTextContent('publication')
    expect(screen.getByTestId('studio-dirty')).toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
  })

  it('`Discard changes` leaves the draft behind and switches at once', async () => {
    const save = vi.fn(async (_id: string, _document: FlowDocument, _revision: string) => ({
      revision: 'rev-2',
    }))
    await mountDirty({ save })
    await userEvent.click(screen.getByTestId('studio-flow-row-pokedex'))
    await screen.findByTestId('switch-flow-modal')

    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))

    await waitFor(() => expect(screen.getByTestId('studio-top-bar')).toHaveTextContent('pokedex'))
    expect(save).not.toHaveBeenCalled()
    expect(screen.queryByTestId('studio-dirty')).toBeNull()
  })

  it('`Save and switch` writes the draft first, then switches', async () => {
    const save = vi.fn(async (_id: string, _document: FlowDocument, _revision: string) => ({
      revision: 'rev-2',
    }))
    await mountDirty({ save })
    await userEvent.click(screen.getByTestId('studio-flow-row-pokedex'))
    await screen.findByTestId('switch-flow-modal')

    await userEvent.click(screen.getByRole('button', { name: 'Save and switch' }))

    await waitFor(() => expect(screen.getByTestId('studio-top-bar')).toHaveTextContent('pokedex'))
    expect(save).toHaveBeenCalledTimes(1)
    // The write went to the flow the edit was made in, against the revision it was loaded at.
    expect(save.mock.calls[0]?.[0]).toBe('publication')
    expect(save.mock.calls[0]?.[2]).toBe('rev-1')
    expect(screen.queryByTestId('switch-flow-modal')).toBeNull()
  })

  it('`Save and switch` stays put when the write is rejected, and says why', async () => {
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
    await mountDirty({ save })
    await userEvent.click(screen.getByTestId('studio-flow-row-pokedex'))
    await screen.findByTestId('switch-flow-modal')

    await userEvent.click(screen.getByRole('button', { name: 'Save and switch' }))

    await waitFor(() => expect(screen.getByTestId('studio-conflict-chip')).toBeInTheDocument())
    expect(screen.getByTestId('studio-top-bar')).toHaveTextContent('publication')
    expect(screen.getByTestId('studio-dirty')).toBeInTheDocument()
    // The dialog gets out of the way, so the conflict's own reload and copy-draft are reachable.
    expect(screen.queryByTestId('switch-flow-modal')).toBeNull()
    expect(save).toHaveBeenCalledTimes(1)
  })
})

describe('choosing a start', () => {
  it('draws the Start section for a single-start flow, and keeps that start out of the node list', async () => {
    mount(twoFlowClient())
    await waitFor(() => expect(screen.getByTestId('run-start-button')).toBeInTheDocument())

    expect(screen.getByText('Start')).toBeInTheDocument()
    expect(screen.getByTestId('studio-start-row-start1')).toBeInTheDocument()
    expect(screen.queryByTestId('studio-node-row-start1')).toBeNull()
  })

  it('lists every declared start in the sidebar once there is more than one, and re-seeds the inputs on a change', async () => {
    mount(twoFlowClient())
    await waitFor(() => expect(screen.getByTestId('studio-flow-row-pokedex')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('studio-flow-row-pokedex'))

    await screen.findByTestId('studio-start-row-byName')
    expect(screen.getByTestId('studio-start-row-byNumber')).toBeInTheDocument()
    expect(screen.getByTestId('run-input-name')).toBeInTheDocument()
    expect(screen.getByTestId('run-start-button')).toHaveTextContent('Run byName')

    await userEvent.click(screen.getByTestId('studio-start-row-byNumber'))

    await waitFor(() =>
      expect(screen.getByTestId('run-start-button')).toHaveTextContent('Run byNumber'),
    )
    // The second start's own field, seeded from its own default — not the first start's draft.
    expect(screen.getByTestId('run-input-number')).toHaveValue(25)
    expect(screen.queryByTestId('run-input-name')).toBeNull()
  })

  it('moves the same way when the start card is clicked on the canvas instead', async () => {
    mount(twoFlowClient())
    await waitFor(() => expect(screen.getByTestId('studio-flow-row-pokedex')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('studio-flow-row-pokedex'))

    await screen.findByTestId('node-card-byNumber')
    // `fireEvent.click`, not `userEvent.click`: React Flow's drag handling listens for a real
    // `mousedown` on the node wrapper, which trips over jsdom under `userEvent`'s full pointer
    // sequence — see the same note in `FlowCanvas.test.tsx`.
    fireEvent.click(screen.getByTestId('node-card-byNumber'))

    await waitFor(() =>
      expect(screen.getByTestId('run-start-button')).toHaveTextContent('Run byNumber'),
    )
    expect(screen.getByTestId('run-input-number')).toHaveValue(25)
  })

  it('runs the start it is pointed at', async () => {
    const startRun = vi.fn(async () => streamOf([{ type: 'run-accepted' as const, runToken: 't' }]))
    mount(twoFlowClient({ startRun }))
    await waitFor(() => expect(screen.getByTestId('studio-flow-row-pokedex')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('studio-flow-row-pokedex'))

    await screen.findByTestId('studio-start-row-byName')
    await userEvent.click(screen.getByTestId('studio-start-row-byNumber'))
    await waitFor(() =>
      expect(screen.getByTestId('run-start-button')).toHaveTextContent('Run byNumber'),
    )
    await userEvent.click(screen.getByTestId('run-start-button'))

    await waitFor(() => expect(startRun).toHaveBeenCalledTimes(1))
    expect(startRun).toHaveBeenCalledWith({
      flowId: 'pokedex',
      startId: 'byNumber',
      input: { number: 25 },
    })
  })
})

describe('`3B` — retrying a failed node', () => {
  const FAILED_REPORT = {
    ...REPORT,
    runNumber: 220,
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
  } as unknown as WireRunReportPayload

  const failedStream = () =>
    streamOf([
      { type: 'run-accepted', runToken: 'tok' },
      { type: 'run-settled', report: FAILED_REPORT },
    ])

  async function runUntilFailed(client: JobikClient) {
    mount(client)
    await waitFor(() => expect(screen.getByTestId('run-input-title')).toBeInTheDocument())
    await userEvent.type(screen.getByTestId('run-input-title'), 'A post')
    await userEvent.click(screen.getByTestId('run-start-button'))
    await waitFor(() =>
      expect(
        within(screen.getByTestId('node-card-render')).getByTestId('node-state-failed'),
      ).toBeInTheDocument(),
    )
  }

  /** A first run that fails, then a second that never settles — so the retry stays in flight. */
  function retryableClient() {
    const startRun = vi.fn(async () => {
      if (startRun.mock.calls.length > 1) {
        return (async function* () {
          yield { type: 'run-accepted', runToken: 'tok-2' } as RunStreamEvent
          await new Promise<void>(() => {})
        })()
      }
      return failedStream()
    })
    return { client: stubClient({ startRun }), startRun }
  }

  it('starts a run and puts the card into the retrying state', async () => {
    const { client, startRun } = retryableClient()
    await runUntilFailed(client)

    await userEvent.click(within(screen.getByTestId('node-card-render')).getByTestId('node-retry'))

    // The engine has no per-node re-execution, so `Retry node` starts the same run `Re-run` does.
    await waitFor(() => expect(startRun).toHaveBeenCalledTimes(2))

    // `3B`: the header swaps its dot for the spinner and the status word becomes `retrying`.
    await waitFor(() =>
      expect(
        within(screen.getByTestId('node-card-render')).getByTestId('node-spinner'),
      ).toBeInTheDocument(),
    )
    const card = screen.getByTestId('node-card-render')
    expect(within(card).getByTestId('node-status').textContent).toBe('retrying')
    expect(within(card).queryByTestId('node-kind-dot')).toBeNull()
  })

  it('keeps the failure it is retrying from on screen, with both actions dimmed', async () => {
    const { client } = retryableClient()
    await runUntilFailed(client)

    await userEvent.click(within(screen.getByTestId('node-card-render')).getByTestId('node-retry'))

    await waitFor(() =>
      expect(
        within(screen.getByTestId('node-card-render')).getByTestId('node-spinner'),
      ).toBeInTheDocument(),
    )
    // The error well survives the retry: the card still says what it is retrying *from*.
    const card = screen.getByTestId('node-card-render')
    expect(within(card).getByTestId('node-error-name').textContent).toBe('ImageRenderError')
    expect(within(card).getByTestId('node-error-message').textContent).toContain(
      'Unsupported colour profile',
    )
    expect(within(card).getByTestId('node-retry')).toBeDisabled()
    expect(within(card).getByTestId('node-view-trace')).toBeDisabled()
  })

  it('leaves the retry behind once the run it started has settled', async () => {
    const startRun = vi.fn(async () => failedStream())
    await runUntilFailed(stubClient({ startRun }))

    await userEvent.click(within(screen.getByTestId('node-card-render')).getByTestId('node-retry'))

    await waitFor(() => expect(startRun).toHaveBeenCalledTimes(2))
    // The second run failed too, so the card is back to a plain `failed` — not still retrying.
    await waitFor(() =>
      expect(
        within(screen.getByTestId('node-card-render')).getByTestId('node-retry'),
      ).toBeEnabled(),
    )
    expect(within(screen.getByTestId('node-card-render')).queryByTestId('node-spinner')).toBeNull()
  })
})

describe('`2A` — run history as a navigator', () => {
  const SECOND_REPORT = { ...REPORT, runNumber: 220, elapsedMs: 1100 }

  /** Two runs that settle: `#219`, then `#220`. */
  function twoRunClient() {
    const startRun = vi.fn(async () =>
      streamOf([
        { type: 'run-accepted', runToken: 'tok' },
        {
          type: 'run-settled',
          report: startRun.mock.calls.length > 1 ? SECOND_REPORT : REPORT,
        },
      ]),
    )
    return stubClient({ startRun })
  }

  async function runTwice() {
    mount(twoRunClient())
    await waitFor(() => expect(screen.getByTestId('run-input-title')).toBeInTheDocument())
    await userEvent.type(screen.getByTestId('run-input-title'), 'A post')
    await userEvent.click(screen.getByTestId('run-start-button'))
    await waitFor(() => expect(screen.getByTestId('studio-run-row-219')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('run-rerun-button'))
    await waitFor(() => expect(screen.getByTestId('studio-run-row-220')).toBeInTheDocument())
  }

  it('marks the newest run until a row is picked', async () => {
    await runTwice()
    await waitFor(() =>
      expect(screen.getByTestId('studio-dock-run-meta').textContent).toBe('#220 · 1.1s'),
    )
  })

  it('brings an earlier run back onto the dock and the canvas', async () => {
    await runTwice()

    await userEvent.click(screen.getByTestId('studio-run-row-219'))

    await waitFor(() =>
      expect(screen.getByTestId('studio-dock-run-meta').textContent).toBe('#219 · 2.4s'),
    )
    // The canvas is that run's too: `#219` settled both nodes, so both still read `ok`.
    expect(
      within(screen.getByTestId('node-card-render')).getByTestId('node-status').textContent,
    ).toContain('ok')
  })

  it('goes back to the newest run when its own row is picked again', async () => {
    await runTwice()

    await userEvent.click(screen.getByTestId('studio-run-row-219'))
    await waitFor(() =>
      expect(screen.getByTestId('studio-dock-run-meta').textContent).toBe('#219 · 2.4s'),
    )

    await userEvent.click(screen.getByTestId('studio-run-row-220'))
    await waitFor(() =>
      expect(screen.getByTestId('studio-dock-run-meta').textContent).toBe('#220 · 1.1s'),
    )
  })

  it('hands the rows no select handler while a run is in flight', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const startRun = vi.fn(async () => {
      if (startRun.mock.calls.length > 1) {
        return (async function* () {
          yield { type: 'run-accepted', runToken: 'tok-2' } as RunStreamEvent
          await gate
        })()
      }
      return streamOf([
        { type: 'run-accepted', runToken: 'tok' },
        { type: 'run-settled', report: REPORT },
      ])
    })
    mount(stubClient({ startRun }))
    await waitFor(() => expect(screen.getByTestId('run-input-title')).toBeInTheDocument())
    await userEvent.type(screen.getByTestId('run-input-title'), 'A post')
    await userEvent.click(screen.getByTestId('run-start-button'))
    await waitFor(() => expect(screen.getByTestId('studio-run-row-219')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('run-rerun-button'))
    await waitFor(() => expect(screen.getByTestId('studio-running-cancel')).toBeInTheDocument())

    // The live run has no row of its own, so a row that took the canvas over would strand the
    // user with no way back to what is actually happening.
    await userEvent.click(screen.getByTestId('studio-run-row-219'))
    // F1/`2A:1191`: the dock header names the run's state for the whole run, so the live one still
    // reads `Running` — asserting it names *that* is what proves the archived row was ignored.
    expect(screen.getByTestId('studio-dock-status').textContent).toBe('Running')
    release()
  })
})

/**
 * F02 — an invalid run input used to be a completely silent no-op.
 *
 * `RunIdleState.onInvalid` was declared, and `RunIdleView` fired it, and NOTHING anywhere supplied
 * it; the other four affordances went through `runInputValues()`, which returned `undefined` on a
 * rejected draft and reported nothing at all. A required field left empty produced no field error,
 * no strip, no modal, no `3B` dim and no HTTP request — the press simply did nothing.
 *
 * The fixture below is the first in this file whose start declares a CONSTRAINT: every other one
 * is a bare `z.string()`, which accepts `''`, so nothing here could ever have caught this.
 */
describe('F02: a draft the start schema rejects', () => {
  const CONSTRAINED_DESCRIPTOR = {
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
              field: 'name',
              required: true,
              annotation: 'string',
              control: { kind: 'string' as const, minLength: 1 },
            },
          ],
        },
        output: {
          nodeId: 'start1',
          fields: [{ field: 'name', required: true, annotation: 'string' }],
        },
      },
    ],
  }

  const CONSTRAINED_DOCUMENT = {
    format: 'jobik.flow',
    version: 1,
    connections: [],
    literals: {},
    layout: { start1: { x: 56, y: 248 } },
  } as unknown as FlowDocument

  function mountConstrained(startRun: JobikClient['startRun']) {
    return mount(
      stubClient({
        loadFlow: async () => ({
          descriptor: CONSTRAINED_DESCRIPTOR,
          document: CONSTRAINED_DOCUMENT,
          revision: 'rev-1',
        }),
        startRun,
      }),
    )
  }

  it('names the offending field in the run panel instead of doing nothing, and starts no run', async () => {
    const startRun = vi.fn(async () => streamOf([{ type: 'run-accepted' as const, runToken: 't' }]))
    mountConstrained(startRun)

    await waitFor(() => expect(screen.getByTestId('run-start-button')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('run-start-button'))

    await waitFor(() => expect(screen.getByTestId('run-input-issues')).toBeInTheDocument())
    const row = screen.getByTestId('run-input-issue-name')
    expect(row.textContent).toContain('name')
    // The row carries the schema's own sentence too, not only the field it names.
    expect((row.textContent ?? '').replace('name', '').trim().length).toBeGreaterThan(0)
    expect(startRun).not.toHaveBeenCalled()
  })

  it('reports the same way for ⌘↵, which never touched onInvalid at all', async () => {
    const startRun = vi.fn(async () => streamOf([{ type: 'run-accepted' as const, runToken: 't' }]))
    mountConstrained(startRun)

    await waitFor(() => expect(screen.getByTestId('run-input-name')).toBeInTheDocument())
    await userEvent.keyboard('{Control>}{Enter}{/Control}')

    await waitFor(() => expect(screen.getByTestId('run-input-issues')).toBeInTheDocument())
    expect(startRun).not.toHaveBeenCalled()
  })

  it('drops the finding as soon as the draft it was about changes', async () => {
    const startRun = vi.fn(async () => streamOf([{ type: 'run-accepted' as const, runToken: 't' }]))
    mountConstrained(startRun)

    await waitFor(() => expect(screen.getByTestId('run-start-button')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('run-start-button'))
    await waitFor(() => expect(screen.getByTestId('run-input-issues')).toBeInTheDocument())

    await userEvent.type(screen.getByTestId('run-input-name'), 'pikachu')
    expect(screen.queryByTestId('run-input-issues')).toBeNull()
  })

  it('clears the finding once a draft that satisfies the schema actually runs', async () => {
    const startRun = vi.fn(async () => streamOf([{ type: 'run-accepted' as const, runToken: 't' }]))
    mountConstrained(startRun)

    await waitFor(() => expect(screen.getByTestId('run-start-button')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('run-start-button'))
    await waitFor(() => expect(screen.getByTestId('run-input-issues')).toBeInTheDocument())

    await userEvent.type(screen.getByTestId('run-input-name'), 'pikachu')
    await userEvent.click(screen.getByTestId('run-start-button'))

    await waitFor(() => expect(startRun).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('run-input-issues')).toBeNull()
  })
})

/**
 * F07 — a multi-start flow used to lose its entry-point chooser after the first run, permanently.
 *
 * The `SegmentedControl` used to exist only in `RunIdleView`, and nothing ever returned a settled
 * panel to idle: once `pokedex`'s `byName` had run, the panel read `Completed #7` with `Re-run
 * byName` and no chooser at all, so `byNumber` — half of the repository's own demonstration of two
 * independent pipelines — could be reached again only by leaving the flow and coming back, which
 * also threw the run history away.
 *
 * The chooser is gone now, replaced by the sidebar's `Start` section and a click on a start card on
 * the canvas — both always on screen regardless of which run-panel state is showing, so the bug
 * this section guards cannot recur structurally. The tests below still run the sidebar row through
 * the same settled-panel scenarios F07 introduced, since the re-arm behaviour they exercise
 * (dropping `Re-run`, reseeding the next start's own draft, keeping the archive) is `selectStart`'s
 * and is unrelated to where the click that calls it comes from.
 */
describe('F07: choosing another start after a run has settled', () => {
  const POKEDEX_REPORT = {
    flowName: 'pokedex',
    startId: 'byName',
    runNumber: 7,
    status: 'ok' as const,
    elapsedMs: 1200,
    nodes: [
      {
        nodeId: 'byName',
        status: 'ok' as const,
        elapsedMs: 12,
        output: { name: 'pikachu' },
        assets: {},
        error: null,
      },
    ],
    logs: [],
    error: null,
  } as unknown as WireRunReportPayload

  const POKEDEX_FAILURE = {
    ...POKEDEX_REPORT,
    runNumber: 8,
    status: 'failed' as const,
    nodes: [
      {
        nodeId: 'byName',
        status: 'failed' as const,
        elapsedMs: 12,
        output: null,
        assets: {},
        error: {
          _tag: 'NodeInvokeError',
          message: 'pikachu is not a pokedex entry.',
          authored: true,
        },
      },
    ],
  } as unknown as WireRunReportPayload

  /** Loads `pokedex` and runs `byName` to whichever report the caller wants. */
  async function runByName(report: WireRunReportPayload) {
    const startRun = vi.fn(async () =>
      streamOf([
        { type: 'run-accepted' as const, runToken: 'tok' },
        { type: 'run-settled' as const, report },
      ]),
    )
    mount(twoFlowClient({ startRun }))
    await waitFor(() => expect(screen.getByTestId('studio-flow-row-pokedex')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('studio-flow-row-pokedex'))
    await screen.findByTestId('studio-start-row-byName')
    await userEvent.type(screen.getByTestId('run-input-name'), 'pikachu')
    await userEvent.click(screen.getByTestId('run-start-button'))
    return startRun
  }

  it('keeps the sidebar’s Start section on a completed panel and re-arms for the start it is moved to', async () => {
    await runByName(POKEDEX_REPORT)
    await waitFor(() => expect(screen.getByTestId('run-rerun-button')).toBeInTheDocument())

    // The section is still there — this is the whole finding.
    expect(screen.getByTestId('studio-start-row-byName')).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('studio-start-row-byNumber'))

    // The panel re-arms: a report about `byName` is not a report about `byNumber`, so it returns
    // to idle with `byNumber`'s own field, seeded from that start's own default.
    await waitFor(() =>
      expect(screen.getByTestId('run-start-button')).toHaveTextContent('Run byNumber'),
    )
    expect(screen.queryByTestId('run-rerun-button')).toBeNull()
    expect(screen.getByTestId('run-input-number')).toHaveValue(25)
    expect(screen.queryByTestId('run-input-name')).toBeNull()
  })

  it('keeps the run-history archive across the switch', async () => {
    await runByName(POKEDEX_REPORT)
    await waitFor(() => expect(screen.getByTestId('studio-run-row-7')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('studio-start-row-byNumber'))
    await waitFor(() =>
      expect(screen.getByTestId('run-start-button')).toHaveTextContent('Run byNumber'),
    )

    // Leaving the flow was the only escape before, and it emptied this. Switching starts does not.
    expect(screen.getByTestId('studio-run-row-7')).toBeInTheDocument()
    // And the run is still summarised where the idle panel puts it.
    expect(screen.getByTestId('run-last-run-status')).toHaveTextContent('completed')
  })

  it('actually runs the start it was moved to', async () => {
    const startRun = await runByName(POKEDEX_REPORT)
    await waitFor(() => expect(screen.getByTestId('run-rerun-button')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('studio-start-row-byNumber'))
    await waitFor(() =>
      expect(screen.getByTestId('run-start-button')).toHaveTextContent('Run byNumber'),
    )
    await userEvent.click(screen.getByTestId('run-start-button'))

    await waitFor(() => expect(startRun).toHaveBeenCalledTimes(2))
    expect(startRun).toHaveBeenLastCalledWith({
      flowId: 'pokedex',
      startId: 'byNumber',
      input: { number: 25 },
    })
  })

  it('keeps the sidebar’s Start section on a failed panel too, and re-arms from there', async () => {
    await runByName(POKEDEX_FAILURE)
    await waitFor(() => expect(screen.getByTestId('run-error-well')).toBeInTheDocument())

    expect(screen.getByTestId('studio-start-row-byName')).toBeInTheDocument()

    await userEvent.click(screen.getByTestId('studio-start-row-byNumber'))

    await waitFor(() =>
      expect(screen.getByTestId('run-start-button')).toHaveTextContent('Run byNumber'),
    )
    expect(screen.queryByTestId('run-error-well')).toBeNull()
    expect(screen.getByTestId('studio-run-row-8')).toBeInTheDocument()
  })

  it('still shows a settled run of the start it is on, and a row picked from the history', async () => {
    await runByName(POKEDEX_REPORT)
    await waitFor(() => expect(screen.getByTestId('run-rerun-button')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('studio-start-row-byNumber'))
    await waitFor(() =>
      expect(screen.getByTestId('run-start-button')).toHaveTextContent('Run byNumber'),
    )

    // The row is still a way back to the run itself — the gate is about the panel's default view,
    // not about what a deliberate pick may show.
    await userEvent.click(screen.getByTestId('studio-run-row-7'))
    await waitFor(() => expect(screen.getByTestId('run-rerun-button')).toBeInTheDocument())
  })
})
