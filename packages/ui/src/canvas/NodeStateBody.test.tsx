import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { motion, statusColors, surfaces, textColors } from '../tokens.js'
import { canvasColors } from './canvasTokens.js'
import { MetadataRow, NodeStateBody } from './NodeStateBody.js'

afterEach(cleanup)

describe('NodeStateBody — queued', () => {
  it('renders the waiting line and three placeholder bars at the artboard weights', () => {
    render(
      <NodeStateBody
        detail={{ kind: 'queued', waitingOn: 'render.image' }}
        captionColor={textColors.typeAnnotation}
      />,
    )
    expect(screen.getByTestId('node-state-queued')).toHaveStyle({ padding: '12px' })
    expect(screen.getByTestId('node-waiting-on')).toHaveTextContent('Waiting on render.image')
    expect(screen.getByTestId('node-waiting-on')).toHaveStyle({
      fontSize: '11.5px',
      color: canvasColors.fieldLabelDim,
    })

    const bars = screen.getAllByTestId('node-placeholder-bar')
    expect(bars).toHaveLength(3)
    expect(bars[0]).toHaveStyle({
      height: '6px',
      borderRadius: '3px',
      background: canvasColors.placeholderBar,
      flexGrow: '1',
    })
    expect(bars[2]).toHaveStyle({ flexGrow: '2' })
  })

  it('accepts a different set of bar weights', () => {
    render(
      <NodeStateBody
        detail={{ kind: 'queued', waitingOn: 'render.image', placeholderBars: [1, 3] }}
        captionColor={textColors.typeAnnotation}
      />,
    )
    expect(screen.getAllByTestId('node-placeholder-bar')).toHaveLength(2)
  })
})

describe('NodeStateBody — media', () => {
  it('shimmers with a pulsing label while running', () => {
    render(
      <NodeStateBody
        detail={{ kind: 'media', skeleton: true, skeletonLabel: 'rasterising' }}
        captionColor={textColors.typeAnnotation}
      />,
    )
    const block = screen.getByTestId('node-state-media-block')
    expect(block).toHaveStyle({
      height: '96px',
      background: canvasColors.skeleton,
      animation: motion.shimmer,
    })
    expect((block as HTMLElement).style.backgroundSize).toBe('220% 100%')
    expect(screen.getByTestId('node-state-skeleton-label')).toHaveStyle({
      animation: motion.pulseSlow,
    })
  })

  it('shows the striped output and the ok metadata caption', () => {
    render(
      <NodeStateBody
        detail={{ kind: 'media', caption: <MetadataRow parts={['1024×1024', 'png', '412 kb']} /> }}
        captionColor={canvasColors.metadata}
      />,
    )
    const block = screen.getByTestId('node-state-media-block')
    expect(block).toHaveStyle({ height: '96px', background: surfaces.imagePlaceholder })
    expect(block).toHaveTextContent('image output')
    const row = screen.getByTestId('node-metadata-row')
    expect(row).toHaveTextContent('1024×1024 · png · 412 kb')
    expect(row).toHaveStyle({ color: canvasColors.metadata, fontSize: '10px' })
  })

  it('drops the media to .55 and drops its label for the cached treatment', () => {
    render(
      <NodeStateBody
        detail={{ kind: 'media', dimmed: true, caption: 'reused from run #218' }}
        captionColor={textColors.typeAnnotation}
      />,
    )
    expect(screen.getByTestId('node-state-media-block')).toHaveStyle({ opacity: '0.55' })
    expect(screen.getByTestId('node-state-media-block')).not.toHaveTextContent('image output')
    expect(screen.getByTestId('node-state-caption')).toHaveStyle({
      color: textColors.typeAnnotation,
      fontSize: '10px',
    })
  })
})

describe('NodeStateBody — failed', () => {
  it('renders the error well with the tagged name and the safe message', () => {
    render(
      <NodeStateBody
        detail={{
          kind: 'failed',
          errorName: 'ImageRenderError',
          message: 'Unsupported colour profile in markdown asset at line 4.',
        }}
        captionColor={textColors.typeAnnotation}
      />,
    )
    expect(screen.getByTestId('node-error-well')).toHaveStyle({
      border: `1px solid ${canvasColors.failedWellBorder}`,
      background: surfaces.failedErrorWell,
      padding: '9px 10px',
    })
    expect(screen.getByTestId('node-error-name')).toHaveStyle({
      color: statusColors.errorTag,
      fontSize: '10.5px',
    })
    expect(screen.getByTestId('node-error-message')).toHaveStyle({
      color: statusColors.errorBody,
      fontSize: '11.5px',
    })
  })

  it('offers View trace and a solid Retry node, and calls back', async () => {
    const onViewTrace = vi.fn()
    const onRetry = vi.fn()
    render(
      <NodeStateBody
        detail={{ kind: 'failed', errorName: 'E', message: 'm', onViewTrace, onRetry }}
        captionColor={textColors.typeAnnotation}
      />,
    )

    const trace = screen.getByRole('button', { name: 'View trace' })
    expect(trace).toHaveStyle({
      height: '26px',
      border: `1px solid ${canvasColors.failedActionBorder}`,
      color: canvasColors.failedActionLabel,
    })
    const retry = screen.getByRole('button', { name: 'Retry node' })
    expect(retry).toHaveStyle({
      height: '26px',
      background: statusColors.failed,
      color: canvasColors.failedSolidLabel,
      fontWeight: '600',
    })

    await userEvent.click(trace)
    await userEvent.click(retry)
    expect(onViewTrace).toHaveBeenCalledTimes(1)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

/**
 * The same row serves both artboards: `Node states` ok is 10px with an 8px gap (design 714), the
 * in-canvas slot's caption row is 9.5px with a 10px gap (204). Same colour, same separators.
 */
describe('MetadataRow', () => {
  it('defaults to the Node states card’s own size and gap', () => {
    render(<MetadataRow parts={['png', '412 kb']} />)
    const row = screen.getByTestId('node-metadata-row')
    expect(row).toHaveStyle({ fontSize: '10px', gap: '8px', color: canvasColors.metadata })
  })

  it('takes the slot caption row’s size and gap when the caller asks for them', () => {
    render(<MetadataRow parts={['png', '412 kb']} fontSize={9.5} gap={10} />)
    const row = screen.getByTestId('node-metadata-row')
    expect(row).toHaveStyle({ fontSize: '9.5px', gap: '10px' })
    expect(row).toHaveTextContent('png · 412 kb')
  })
})
