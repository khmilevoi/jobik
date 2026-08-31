import type { FlowDocument } from '@jobik/core'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JobikClient, RunStreamEvent, WireRunReportPayload } from '../client/index.js'
import { JobikServerError, JobikTransportError } from '../client/index.js'
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

    await waitFor(() => expect(screen.getByTestId('run-outputs-label')).toBeInTheDocument())
    expect(screen.getByTestId('run-output-name-image')).toBeInTheDocument()
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

    expect(screen.queryByTestId('studio-sidebar')).toBeNull()
    expect(screen.queryByTestId('studio-dock')).toBeNull()
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

    await waitFor(() => expect(screen.getByTestId('run-output-open-image')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('run-output-open-image'))
    await waitFor(() => expect(screen.getByTestId('output-viewer')).toBeInTheDocument())
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
    expect(screen.getByTestId('output-viewer')).toBeInTheDocument()
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
      expect(screen.getByTestId('output-viewer')).toBeInTheDocument()
    } finally {
      globalThis.URL.createObjectURL = originalCreate
      globalThis.URL.revokeObjectURL = originalRevoke
    }
  })

  it('closes on Escape, the artboard drawing no close control of its own', async () => {
    await openViewer()
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByTestId('output-viewer')).toBeNull()
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

    // Qualified: `render.image` (the asset) and `publish.image` (the string output).
    await waitFor(() =>
      expect(screen.getByTestId('run-output-open-render.image')).toBeInTheDocument(),
    )
    await userEvent.click(screen.getByTestId('run-output-open-render.image'))

    await waitFor(() => expect(screen.getByTestId('output-viewer')).toBeInTheDocument())
    // Opened `render` (the asset descriptor's own id), never `publish` (the string).
    expect(screen.getByTestId('output-viewer-panel').textContent).toContain('asset-1')
    expect(screen.getByTestId('output-viewer-panel').textContent).not.toContain(
      'not a binary field',
    )
  })
})
