import type { FlowDocument } from '@jobik/core'
import { action, atom } from '@reatom/core'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { Profiler, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderInNodeContext } from '#canvas/canvasTestUtils.js'
import { MetadataRow } from '#canvas/NodeStateBody/NodeStateBody.js'
import type { NodeCardData } from '#canvas/types.js'
import type { JobikClient, RunStreamEvent, SafeFlowDescriptorPayload } from '#client/index.js'
import { reatomCanvas } from '#model/canvas.js'
import { reatomStudio, StudioModelProvider } from '#model/index.js'
import type { RetryState, StudioModel } from '#model/types.js'
import type { FlowUiDescriptor } from '#output/index.js'
import { NO_PROBLEMS } from '#studio/problems.js'
import type { RunSession } from '#studio/runSession.js'
import { applyRunEvent, createRunSession } from '#studio/runSession.js'
import { JobikNode, NodeCard } from './NodeCard.js'

afterEach(cleanup)

/**
 * The card reads `CanvasModel.nodeOverlay(id)` for its own run state, so every case below mounts it
 * under a model — the same bargain `RunPanel` takes, and the same harness `model/context.test.tsx`
 * builds. With no run behind it the overlay is `undefined` and the card draws exactly the `data` it
 * was handed, which is why every artboard case here is unchanged: they state what the card draws
 * from a `NodeCardData`, and that is still the whole of it.
 */
const IDLE_CLIENT = {
  listFlows: vi.fn(async () => []),
  loadFlow: vi.fn(),
  validate: vi.fn(),
  save: vi.fn(),
  startRun: vi.fn(),
  cancelRun: vi.fn(),
  assetUrl: vi.fn(() => '/api/assets/x'),
  extensionBundleUrl: vi.fn(() => '/api/flows/x/ui.js'),
} as unknown as JobikClient

function withModel(node: ReactNode, client: JobikClient = IDLE_CLIENT) {
  return (
    <StudioModelProvider
      model={reatomStudio({ client, externals: {}, importModule: async () => ({}) })}
    >
      {node}
    </StudioModelProvider>
  )
}

/** A card inside a real React Flow node — the only context a `<Handle>` can live in — and a model. */
function mountCard(node: ReactNode) {
  return renderInNodeContext(withModel(node))
}

/** A card that draws no handles, so it needs the model but not the React Flow context. */
function mountPlain(node: ReactNode) {
  return render(withModel(node))
}

/** `Studio — default`, the selected start card. */
const start1: NodeCardData = {
  id: 'start1',
  state: 'idle',
  isStart: true,
  selected: true,
  outputs: [
    { name: 'title', annotation: 'string' },
    { name: 'markdown', annotation: 'string' },
  ],
  liveFields: ['source:title', 'source:markdown'],
}

/** `Studio — default`, the ok card with an inline output slot. */
const render1: NodeCardData = {
  id: 'render',
  state: 'ok',
  kindDot: 'neutral',
  statusDot: true,
  status: 'ok',
  elapsed: '2.1s',
  inputs: [
    { name: 'title', annotation: 'string' },
    { name: 'markdown', annotation: 'string' },
  ],
  outputs: [
    { name: 'image', annotation: 'Buffer' },
    { name: 'caption', annotation: 'string' },
  ],
  liveFields: ['target:title', 'target:markdown'],
  outputSlot: {
    caption: <MetadataRow parts={['1024×1024', 'png', '412 kb']} />,
    source: 'imageOut',
  },
}

describe('NodeCard — the Studio — default artboard', () => {
  it('gives the start card an Outputs section, no Inputs section, and a footer', async () => {
    mountCard(<NodeCard data={start1} />)
    expect(await screen.findByTestId('node-section-outputs')).toHaveTextContent('Outputs')
    expect(screen.queryByTestId('node-section-inputs')).toBeNull()
    expect(screen.getByTestId('node-start-tag')).toBeInTheDocument()
    expect(screen.getByTestId('node-card-footer')).toBeInTheDocument()
  })

  it('gives every field of the start card a handle', async () => {
    mountCard(<NodeCard data={start1} />)
    expect(await screen.findByTestId('field-handle-source-title')).toBeInTheDocument()
    expect(screen.getByTestId('field-handle-source-markdown')).toBeInTheDocument()
  })

  it('draws the ok card with both sections around the inline output slot', async () => {
    mountCard(<NodeCard data={render1} />)
    const card = await screen.findByTestId('node-card-render')
    expect(within(card).getByTestId('node-section-inputs')).toHaveTextContent('Inputs')
    expect(within(card).getByTestId('node-section-outputs')).toHaveTextContent('Outputs')
    expect(within(card).getByTestId('node-output-slot')).toBeInTheDocument()
    expect(within(card).getByTestId('node-metadata-row')).toHaveTextContent('412 kb')
    expect(within(card).getByTestId('node-output-source')).toHaveTextContent('imageOut')
    expect(screen.getByTestId('node-status')).toHaveTextContent('ok · 2.1s')
    expect(screen.getByTestId('node-status-dot')).toBeInTheDocument()
  })

  it('draws a plain card with no slot and no state body', async () => {
    mountCard(
      <NodeCard
        data={{
          id: 'publish',
          state: 'idle',
          status: 'idle',
          inputs: [{ name: 'image', annotation: 'Buffer' }],
          outputs: [{ name: 'url', annotation: 'string' }],
        }}
      />,
    )
    await screen.findByTestId('node-card-publish')
    expect(screen.queryByTestId('node-output-slot')).toBeNull()
    expect(screen.queryByTestId('node-state-media')).toBeNull()
  })

  it('omits the footer when the card has no fields at all', () => {
    mountPlain(<NodeCard data={{ id: 'publish', state: 'idle', status: 'idle' }} />)
    expect(screen.queryByTestId('node-card-footer')).toBeNull()
  })
})

describe('NodeCard — the Studio — run in progress artboard', () => {
  it('puts a determinate bar under the header of a running node', async () => {
    mountCard(
      <NodeCard
        data={{
          id: 'render',
          state: 'running',
          status: 'running',
          elapsed: '1.3s',
          progress: 0.62,
          inputs: [{ name: 'title', annotation: 'received' }],
          outputs: [{ name: 'image', annotation: 'pending' }],
          liveFields: ['target:title'],
          outputSlot: {
            skeleton: true,
            skeletonLabel: 'rasterising 1024×1024',
            caption: 'frame 2 of 3',
            source: 'imageOut',
          },
        }}
      />,
    )
    await screen.findByTestId('node-progress-track')
    // The width is the one value the stylesheet cannot know, so it rides in as a property.
    expect(
      screen.getByTestId('node-progress-bar').style.getPropertyValue('--jbk-node-progress'),
    ).toBe('62%')
    expect(screen.getByTestId('node-output-skeleton-label')).toHaveTextContent('rasterising')
    expect(screen.getByTestId('field-annotation-dim')).toHaveTextContent('pending')
  })

  it('renders no progress bar when there is no progress', async () => {
    mountCard(<NodeCard data={{ id: 'publish', state: 'idle', status: 'idle' }} />)
    await screen.findByTestId('node-card-publish')
    expect(screen.queryByTestId('node-progress-track')).toBeNull()
  })
})

describe('NodeCard — the Node states artboard', () => {
  it('queued: the waiting line, the placeholder bars and no footer', () => {
    mountPlain(
      <NodeCard
        data={{
          id: 'publish',
          state: 'queued',
          status: 'queued',
          width: 288,
          detail: { kind: 'queued', waitingOn: 'render.image' },
        }}
      />,
    )
    expect(screen.getByTestId('node-title')).toHaveTextContent('publish')
    expect(screen.getByTestId('node-waiting-on')).toHaveTextContent('Waiting on render.image')
    expect(screen.getAllByTestId('node-placeholder-bar')).toHaveLength(3)
    expect(screen.queryByTestId('node-card-footer')).toBeNull()
  })

  it('running: the spinner, the progress bar and the shimmering skeleton label', () => {
    mountPlain(
      <NodeCard
        data={{
          id: 'render',
          state: 'running',
          elapsed: '1.3s',
          progress: 0.62,
          width: 288,
          detail: { kind: 'media', skeleton: true, skeletonLabel: 'rasterising' },
        }}
      />,
    )
    expect(screen.getByTestId('node-spinner')).toBeInTheDocument()
    expect(screen.queryByTestId('node-kind-dot')).toBeNull()
    expect(screen.getByTestId('node-progress-bar')).toBeInTheDocument()
    expect(screen.getByTestId('node-state-skeleton-label')).toHaveTextContent('rasterising')
  })

  it('ok: the kind dot, the status and the metadata row', () => {
    mountPlain(
      <NodeCard
        data={{
          id: 'render',
          state: 'ok',
          status: 'ok',
          elapsed: '2.1s',
          width: 288,
          detail: {
            kind: 'media',
            caption: <MetadataRow parts={['1024×1024', 'png', '412 kb']} />,
          },
        }}
      />,
    )
    expect(screen.getByTestId('node-kind-dot')).toBeInTheDocument()
    expect(screen.getByTestId('node-status')).toHaveTextContent('ok · 2.1s')
    expect(screen.getByTestId('node-metadata-row')).toHaveTextContent('1024×1024 · png · 412 kb')
  })

  it('failed: the error well and both actions', () => {
    mountPlain(
      <NodeCard
        data={{
          id: 'render',
          state: 'failed',
          status: 'failed',
          elapsed: '0.8s',
          width: 288,
          detail: {
            kind: 'failed',
            errorName: 'ImageRenderError',
            message: 'Unsupported colour profile.',
          },
        }}
      />,
    )
    expect(screen.getByTestId('node-error-name')).toHaveTextContent('ImageRenderError')
    expect(screen.getByRole('button', { name: 'View trace' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry node' })).toBeInTheDocument()
  })

  it('cached: the cached status, the unlabelled output and the reuse line', () => {
    mountPlain(
      <NodeCard
        data={{
          id: 'render',
          state: 'cached',
          status: 'cached',
          elapsed: '0.0s',
          width: 288,
          detail: { kind: 'media', dimmed: true, caption: 'reused from run #218' },
        }}
      />,
    )
    expect(screen.getByTestId('node-status')).toHaveTextContent('cached · 0.0s')
    expect(screen.getByTestId('node-state-media-block')).not.toHaveTextContent('image output')
    expect(screen.getByTestId('node-state-caption')).toHaveTextContent('reused from run #218')
  })

  it('lets a card override its width, as the Node states artboard does at 288', () => {
    mountPlain(<NodeCard data={{ id: 'render', state: 'ok', width: 288 }} />)
    expect(screen.getByTestId('node-card-render').style.getPropertyValue('--jbk-card-width')).toBe(
      '288px',
    )
  })
})

type JobikNodeTestProps = {
  readonly data: NodeCardData
  readonly selected: boolean
}

type JobikNodeProps = Parameters<typeof JobikNode>[0]

function makeJobikNodeProps(nodeId: string, opts: JobikNodeTestProps): JobikNodeProps {
  return {
    id: nodeId,
    data: opts.data,
    selected: opts.selected,
    isConnectable: true,
    xPos: 0,
    yPos: 0,
  } as unknown as JobikNodeProps
}

/**
 * The adapter's whole job is deciding which card `NodeCard` is asked to draw, so the reference is
 * a `NodeCard` rendered from the data the adapter should have resolved to. Nothing here names a
 * colour or a class — it compares one render against another.
 */
function reference(selected: boolean): string {
  const { container } = mountPlain(<NodeCard data={{ id: 'reference', state: 'idle', selected }} />)
  return (container.querySelector('[data-testid="node-card-reference"]') as HTMLElement).className
}

function renderAdapter(props: JobikNodeProps): string {
  const { container } = mountPlain(<JobikNode {...props} />)
  return (container.querySelector('[data-testid="node-card-test-node"]') as HTMLElement).className
}

describe('JobikNode — the React Flow adapter', () => {
  it('prefers data.selected when true, over React Flow selected false', () => {
    const selected = reference(true)
    expect(
      renderAdapter(
        makeJobikNodeProps('test-node', {
          data: { id: 'test-node', state: 'idle', selected: true },
          selected: false,
        }),
      ),
    ).toBe(selected)
  })

  it('uses React Flow selected when data.selected is undefined', () => {
    const selected = reference(true)
    expect(
      renderAdapter(
        makeJobikNodeProps('test-node', {
          data: { id: 'test-node', state: 'idle' },
          selected: true,
        }),
      ),
    ).toBe(selected)
  })

  it('respects data.selected false even when React Flow selected true', () => {
    const unselected = reference(false)
    expect(
      renderAdapter(
        makeJobikNodeProps('test-node', {
          data: { id: 'test-node', state: 'idle', selected: false },
          selected: true,
        }),
      ),
    ).toBe(unselected)
  })

  it('falls back to React Flow selected false when data.selected is undefined', () => {
    const unselected = reference(false)
    expect(
      renderAdapter(
        makeJobikNodeProps('test-node', {
          data: { id: 'test-node', state: 'idle' },
          selected: false,
        }),
      ),
    ).toBe(unselected)
  })
})

/**
 * `3D`'s invalid board, as behaviour: the marked card prints its finding count where a run would
 * print its status, the blocked card prints nothing there, and a marked port draws its handle with
 * a mark of its own. Which colours those resolve to is `cardChrome`'s and `fields`'s to decide and
 * `canvasTokens.css.test.ts`'s to keep honest.
 */
describe('NodeCard — the 3D validation marks', () => {
  it('prints the finding count in the header, in place of the idle word', () => {
    mountCard(
      <NodeCard
        data={{
          id: 'render',
          state: 'idle',
          problem: 'error',
          problemCount: '1 error',
          inputs: [{ name: 'markdown', annotation: 'string', problem: 'mismatch' }],
        }}
      />,
    )

    expect(screen.getByTestId('node-status')).toHaveTextContent('1 error')
    expect(screen.queryByText('idle')).toBeNull()
  })

  it('lets the count outrank the START tag on a marked entry point', () => {
    mountCard(
      <NodeCard data={{ id: 'start1', state: 'idle', isStart: true, problemCount: '1 error' }} />,
    )

    expect(screen.queryByTestId('node-start-tag')).toBeNull()
    expect(screen.getByTestId('node-status')).toHaveTextContent('1 error')
  })

  it('marks the unsourced port and leaves the header count off the blocked card', () => {
    mountCard(
      <NodeCard
        data={{
          id: 'publish',
          state: 'idle',
          problem: 'blocked',
          inputs: [{ name: 'caption', annotation: 'no source', problem: 'unsourced' }],
        }}
      />,
    )

    // The blocked card's trailing cell is empty on the artboard: it carries no count of its own.
    expect(screen.getByTestId('node-status')).toHaveTextContent('idle')
    expect(screen.getByTestId('field-annotation-problem')).toHaveTextContent('no source')

    const marked = screen.getByTestId('field-handle-target-caption').className
    const plain = (() => {
      cleanup()
      mountCard(
        <NodeCard
          data={{
            id: 'publish',
            state: 'idle',
            inputs: [{ name: 'caption', annotation: 'string' }],
          }}
        />,
      )
      return screen.getByTestId('field-handle-target-caption').className
    })()
    expect(marked).not.toBe(plain)
  })
})

/** `render` feeds `publish`, so `publish` is a card with a genuine reason to watch `render`. */
const CHAIN_DOCUMENT = {
  format: 'jobik.flow',
  version: 1,
  connections: [
    { from: { node: 'render', field: 'image' }, to: { node: 'publish', field: 'image' } },
  ],
  literals: {},
  layout: { render: { x: 0, y: 0 }, publish: { x: 320, y: 0 } },
} as unknown as FlowDocument

interface CanvasWorld {
  readonly model: StudioModel
  readonly seed: (nodeIds: readonly string[]) => void
  readonly emit: (event: RunStreamEvent) => void
}

/**
 * A model carrying nothing but its canvas, and the session atom behind it.
 *
 * The same shape `model/canvas.test.tsx` builds, and for the same reason: the subject is one node's
 * overlay reaching one card, and a run is only how a session gets written. `NodeCard` reads
 * `model.canvas` and nothing else, so that is the whole of what a provider has to hand it — driving
 * a real `reatomStudio` through a stub stream would put a flow listing, a draft and a run action
 * between the event and the assertion without changing what is asserted.
 */
function canvasWorld(): CanvasWorld {
  const session = atom<RunSession | undefined>(undefined, 'test.viewedSession')
  const canvas = reatomCanvas(
    { client: { assetUrl: () => '/api/assets/x' } as unknown as JobikClient },
    {
      descriptor: atom<SafeFlowDescriptorPayload | undefined>(undefined, 'test.descriptor'),
      document: atom<FlowDocument | undefined>(CHAIN_DOCUMENT, 'test.document'),
      selectedNodeId: atom<string | undefined>(undefined, 'test.selectedNodeId'),
      problems: atom(NO_PROBLEMS, 'test.problems'),
      viewedSession: session,
      running: atom(false, 'test.running'),
      retry: atom<RetryState | undefined>(undefined, 'test.retry'),
      retryNode: action((_target: RetryState) => {}, 'test.retryNode'),
      extension: atom<FlowUiDescriptor | undefined>(undefined, 'test.extension'),
      openOutput: action((_nodeId: string) => {}, 'test.openOutput'),
    },
    'test.canvas',
  )
  return {
    model: { canvas } as unknown as StudioModel,
    seed: (nodeIds) => {
      session.set(createRunSession({ startId: 'render', nodeIds, startedAt: 1000 }))
    },
    emit: (event) => {
      const current = session()
      if (current === undefined) throw new Error('seed the session before emitting into it')
      session.set(applyRunEvent(current, event))
    },
  }
}

const RUNNING_RENDER = {
  type: 'node-status',
  nodeId: 'render',
  status: 'running',
  elapsedMs: 0,
  error: null,
} as RunStreamEvent

describe('NodeCard — reading its own overlay', () => {
  it('draws what the model says about its node, over the data it was handed', async () => {
    const world = canvasWorld()
    render(
      <StudioModelProvider model={world.model}>
        <NodeCard data={{ id: 'render', state: 'idle', status: 'idle' }} />
      </StudioModelProvider>,
    )
    expect(screen.getByTestId('node-status')).toHaveTextContent('idle')

    world.seed(['render', 'publish'])
    world.emit(RUNNING_RENDER)

    await waitFor(() => expect(screen.getByTestId('node-status')).toHaveTextContent('running'))
    expect(screen.getByTestId('node-spinner')).toBeInTheDocument()
    expect(screen.getByTestId('node-progress-bar')).toBeInTheDocument()
  })

  /**
   * Perf fix #1, stated as the only thing that can prove it: a render count.
   *
   * A `<Profiler>` reports only the commits its own subtree took part in, and the update a card's
   * overlay causes starts inside that card — `reatomComponent` re-renders the one component whose
   * read was invalidated, never the tree above it. So a status line for `render` leaves `publish`'s
   * profiler silent, and that silence is the whole claim: before this, one event replaced the
   * session, rebuilt the node array, and re-rendered every card on the canvas.
   *
   * `render` going from `queued` to `running` is the hardest case to keep isolated — `publish`
   * waits on `render`, so the two are genuinely related — and it stays isolated because a
   * downstream card asks whether its upstream has SETTLED, which `running` does not change.
   */
  it('re-renders the card a node-status line is about, and no other', async () => {
    const world = canvasWorld()
    const renders = new Map<string, number>()
    const count = (id: string) => {
      renders.set(id, (renders.get(id) ?? 0) + 1)
    }

    render(
      <StudioModelProvider model={world.model}>
        <Profiler id="render" onRender={() => count('render')}>
          <NodeCard data={{ id: 'render', state: 'idle' }} />
        </Profiler>
        <Profiler id="publish" onRender={() => count('publish')}>
          <NodeCard data={{ id: 'publish', state: 'idle' }} />
        </Profiler>
      </StudioModelProvider>,
    )

    world.seed(['render', 'publish'])
    await waitFor(() => expect(screen.getByTestId('node-card-publish')).toHaveTextContent('queued'))
    renders.clear()

    world.emit(RUNNING_RENDER)
    await waitFor(() => expect(screen.getByTestId('node-card-render')).toHaveTextContent('running'))

    expect(renders.get('render')).toBeGreaterThan(0)
    expect(renders.get('publish') ?? 0).toBe(0)
  })
})
