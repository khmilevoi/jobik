import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderInNodeContext } from '../canvasTestUtils.js'
import { MetadataRow } from '../NodeStateBody/NodeStateBody.js'
import type { NodeCardData } from '../types.js'
import { JobikNode, NodeCard } from './NodeCard.js'

afterEach(cleanup)

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
    renderInNodeContext(<NodeCard data={start1} />)
    expect(await screen.findByTestId('node-section-outputs')).toHaveTextContent('Outputs')
    expect(screen.queryByTestId('node-section-inputs')).toBeNull()
    expect(screen.getByTestId('node-start-tag')).toBeInTheDocument()
    expect(screen.getByTestId('node-card-footer')).toBeInTheDocument()
  })

  it('gives every field of the start card a handle', async () => {
    renderInNodeContext(<NodeCard data={start1} />)
    expect(await screen.findByTestId('field-handle-source-title')).toBeInTheDocument()
    expect(screen.getByTestId('field-handle-source-markdown')).toBeInTheDocument()
  })

  it('draws the ok card with both sections around the inline output slot', async () => {
    renderInNodeContext(<NodeCard data={render1} />)
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
    renderInNodeContext(
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
    render(<NodeCard data={{ id: 'publish', state: 'idle', status: 'idle' }} />)
    expect(screen.queryByTestId('node-card-footer')).toBeNull()
  })
})

describe('NodeCard — the Studio — run in progress artboard', () => {
  it('puts a determinate bar under the header of a running node', async () => {
    renderInNodeContext(
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
    renderInNodeContext(<NodeCard data={{ id: 'publish', state: 'idle', status: 'idle' }} />)
    await screen.findByTestId('node-card-publish')
    expect(screen.queryByTestId('node-progress-track')).toBeNull()
  })
})

describe('NodeCard — the Node states artboard', () => {
  it('queued: the waiting line, the placeholder bars and no footer', () => {
    render(
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
    render(
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
    render(
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
    render(
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
    render(
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
    render(<NodeCard data={{ id: 'render', state: 'ok', width: 288 }} />)
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
  const { container } = render(<NodeCard data={{ id: 'reference', state: 'idle', selected }} />)
  return (container.querySelector('[data-testid="node-card-reference"]') as HTMLElement).className
}

function renderAdapter(props: JobikNodeProps): string {
  const { container } = render(JobikNode(props))
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
