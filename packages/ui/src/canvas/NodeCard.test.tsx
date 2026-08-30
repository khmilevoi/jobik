import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { accent, borders, statusColors, surfaces, textColors } from '../tokens.js'
import { renderInNodeContext } from './canvasTestUtils.js'
import { canvasColors } from './canvasTokens.js'
import { JobikNode, NodeCard } from './NodeCard.js'
import { MetadataRow } from './NodeStateBody.js'
import type { NodeCardData } from './types.js'

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
  it('draws the selected start card at 230px with the selection treatment', async () => {
    renderInNodeContext(<NodeCard data={start1} />)
    const card = await screen.findByTestId('node-card-start1')
    expect(card).toHaveStyle({
      width: '230px',
      background: surfaces.nodeCard,
      border: `1px solid ${accent.selectionBorder}`,
      borderRadius: '7px',
      boxShadow: accent.selectionHalo,
    })
    expect(screen.getByTestId('node-start-tag')).toBeInTheDocument()
  })

  it('gives the start card an Outputs section, no Inputs section, and the 8px footer', async () => {
    renderInNodeContext(<NodeCard data={start1} />)
    expect(await screen.findByTestId('node-section-outputs')).toHaveTextContent('Outputs')
    expect(screen.queryByTestId('node-section-inputs')).toBeNull()
    expect(screen.getByTestId('node-section-outputs')).toHaveStyle({
      height: '22px',
      padding: '0 12px',
      color: canvasColors.sectionLabelSelectedStart,
    })
    expect(screen.getByTestId('node-card-footer')).toHaveStyle({ height: '8px' })
  })

  it('accents the start card handles from liveFields', async () => {
    renderInNodeContext(<NodeCard data={start1} />)
    const handle = await screen.findByTestId('field-handle-source-title')
    expect(handle.style.border).toBe(`1.5px solid ${accent.cssVar}`)
  })

  it('draws the ok card at 316px with both sections around the inline output slot', async () => {
    renderInNodeContext(<NodeCard data={render1} />)
    const card = await screen.findByTestId('node-card-render')
    expect(card).toHaveStyle({ width: '316px', border: '1px solid #232629' })
    expect(within(card).getByTestId('node-section-inputs')).toHaveTextContent('Inputs')
    expect(within(card).getByTestId('node-output-slot')).toBeInTheDocument()
    expect(within(card).getByTestId('node-metadata-row')).toHaveTextContent('412 kb')
    expect(within(card).getByTestId('node-output-source')).toHaveTextContent('imageOut')
    expect(screen.getByTestId('node-status')).toHaveTextContent('ok · 2.1s')
    expect(screen.getByTestId('node-status-dot')).toHaveStyle({ background: statusColors.ok })
  })

  it('leaves an unconnected output handle idle while the connected inputs go accent', async () => {
    renderInNodeContext(<NodeCard data={render1} />)
    const accentHandle = await screen.findByTestId('field-handle-target-title')
    expect(accentHandle.style.border).toBe(`1.5px solid ${accent.cssVar}`)
    const idleHandle = screen.getByTestId('field-handle-source-image')
    expect(idleHandle).toHaveStyle({
      border: `1.5px solid ${canvasColors.handleIdle}`,
    })
  })

  it('draws a plain card at 236px', async () => {
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
    expect(await screen.findByTestId('node-card-publish')).toHaveStyle({ width: '236px' })
  })
})

describe('NodeCard — the Studio — run in progress artboard', () => {
  it('puts a 2px determinate bar directly under the header of a running node', async () => {
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
    const track = await screen.findByTestId('node-progress-track')
    expect(track).toHaveStyle({ height: '2px', background: canvasColors.progressTrack })
    expect(screen.getByTestId('node-progress-bar')).toHaveStyle({
      width: '62%',
      height: '2px',
      background: accent.cssVar,
    })
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
  it('queued: dashed border, dimmed title, waiting line and placeholder bars', () => {
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
    const card = screen.getByTestId('node-card-publish')
    expect(card).toHaveStyle({
      width: '288px',
      background: surfaces.queuedNode,
      border: '1px dashed #23262a',
    })
    expect(screen.getByTestId('node-title')).toHaveStyle({ color: textColors.inactiveListItem })
    expect(screen.getByTestId('node-waiting-on')).toHaveTextContent('Waiting on render.image')
    expect(screen.getAllByTestId('node-placeholder-bar')).toHaveLength(3)
    expect(screen.queryByTestId('node-card-footer')).toBeNull()
  })

  it('running: halo, spinner, progress bar and shimmering skeleton', () => {
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
    expect(screen.getByTestId('node-card-render')).toHaveStyle({
      border: `1px solid ${accent.selectionBorder}`,
      boxShadow: accent.selectionHalo,
    })
    expect(screen.getByTestId('node-spinner')).toBeInTheDocument()
    expect(screen.getByTestId('node-progress-bar')).toHaveStyle({ width: '62%' })
    expect(screen.getByTestId('node-state-skeleton-label')).toHaveTextContent('rasterising')
  })

  it('ok: plain border, green dot and status, and the metadata row', () => {
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
    expect(screen.getByTestId('node-card-render')).toHaveStyle({ border: '1px solid #232629' })
    expect(screen.getByTestId('node-kind-dot')).toHaveStyle({ background: statusColors.ok })
    expect(screen.getByTestId('node-status')).toHaveTextContent('ok · 2.1s')
    expect(screen.getByTestId('node-metadata-row')).toHaveTextContent('1024×1024 · png · 412 kb')
  })

  it('failed: error card, border and halo, the error well and both actions', () => {
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
    expect(screen.getByTestId('node-card-render')).toHaveStyle({
      background: surfaces.failedNodeCard,
      border: `1px solid ${canvasColors.failedBorder}`,
      boxShadow: canvasColors.failedHalo,
    })
    expect(screen.getByTestId('node-error-name')).toHaveTextContent('ImageRenderError')
    expect(screen.getByRole('button', { name: 'View trace' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry node' })).toBeInTheDocument()
  })

  it('cached: muted card, cached dot, .55 output and the reuse line', () => {
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
    expect(screen.getByTestId('node-card-render')).toHaveStyle({
      background: surfaces.cachedNode,
      border: '1px solid #1e2124',
    })
    expect(screen.getByTestId('node-kind-dot')).toHaveStyle({ background: '#4a5157' })
    expect(screen.getByTestId('node-status')).toHaveTextContent('cached · 0.0s')
    expect(screen.getByTestId('node-state-media-block')).toHaveStyle({ opacity: '0.55' })
    expect(screen.getByTestId('node-state-caption')).toHaveTextContent('reused from run #218')
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

describe('JobikNode — the React Flow adapter', () => {
  it('prefers data.selected when true, over React Flow selected false', () => {
    const props = makeJobikNodeProps('test-node', {
      data: {
        id: 'test-node',
        state: 'idle',
        selected: true,
      },
      selected: false,
    })
    const { container } = render(JobikNode(props))
    const card = container.querySelector('[data-testid="node-card-test-node"]')
    expect(card).toHaveStyle({
      border: `1px solid ${accent.selectionBorder}`,
    })
  })

  it('uses React Flow selected when data.selected is undefined', () => {
    const props = makeJobikNodeProps('test-node', {
      data: {
        id: 'test-node',
        state: 'idle',
      },
      selected: true,
    })
    const { container } = render(JobikNode(props))
    const card = container.querySelector('[data-testid="node-card-test-node"]')
    expect(card).toHaveStyle({
      border: `1px solid ${accent.selectionBorder}`,
    })
  })

  it('respects data.selected false even when React Flow selected true', () => {
    const props = makeJobikNodeProps('test-node', {
      data: {
        id: 'test-node',
        state: 'idle',
        selected: false,
      },
      selected: true,
    })
    const { container } = render(JobikNode(props))
    const card = container.querySelector('[data-testid="node-card-test-node"]')
    expect(card).toHaveStyle({
      border: `1px solid ${borders.control}`,
    })
  })

  it('falls back to React Flow selected false when data.selected is undefined', () => {
    const props = makeJobikNodeProps('test-node', {
      data: {
        id: 'test-node',
        state: 'idle',
      },
      selected: false,
    })
    const { container } = render(JobikNode(props))
    const card = container.querySelector('[data-testid="node-card-test-node"]')
    expect(card).toHaveStyle({
      border: `1px solid ${borders.control}`,
    })
  })
})
