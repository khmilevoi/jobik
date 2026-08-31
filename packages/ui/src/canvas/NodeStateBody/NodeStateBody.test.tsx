import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { textColors } from '#tokens.js'
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
    expect(screen.getByTestId('node-waiting-on')).toHaveTextContent('Waiting on render.image')

    const bars = screen.getAllByTestId('node-placeholder-bar')
    expect(bars).toHaveLength(3)
    // The weights are the caller's, so they travel as the custom property the rule reads.
    expect(bars[0]?.style.getPropertyValue('--jbk-placeholder-bar-flex')).toBe('1')
    expect(bars[2]?.style.getPropertyValue('--jbk-placeholder-bar-flex')).toBe('2')
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
  it('drops the striped placeholder for the skeleton and its label while running', () => {
    render(
      <NodeStateBody
        detail={{ kind: 'media', skeleton: true, skeletonLabel: 'rasterising' }}
        captionColor={textColors.typeAnnotation}
      />,
    )
    const block = screen.getByTestId('node-state-media-block')
    expect(block).not.toHaveTextContent('image output')
    expect(screen.getByTestId('node-state-skeleton-label')).toHaveTextContent('rasterising')
  })

  it('shows the striped output and the ok metadata caption', () => {
    render(
      <NodeStateBody
        detail={{ kind: 'media', caption: <MetadataRow parts={['1024×1024', 'png', '412 kb']} /> }}
        captionColor={textColors.metadata}
      />,
    )
    expect(screen.getByTestId('node-state-media-block')).toHaveTextContent('image output')
    expect(screen.getByTestId('node-metadata-row')).toHaveTextContent('1024×1024 · png · 412 kb')
  })

  it('drops the placeholder label for the cached treatment and keeps the reuse line', () => {
    render(
      <NodeStateBody
        detail={{ kind: 'media', dimmed: true, caption: 'reused from run #218' }}
        captionColor={textColors.typeAnnotation}
      />,
    )
    expect(screen.getByTestId('node-state-media-block')).not.toHaveTextContent('image output')
    const caption = screen.getByTestId('node-state-caption')
    expect(caption).toHaveTextContent('reused from run #218')
    expect(caption.style.getPropertyValue('--jbk-node-caption-color')).toBe(
      textColors.typeAnnotation,
    )
  })

  it('renders whatever the caller supplies in place of the placeholder', () => {
    render(
      <NodeStateBody
        detail={{ kind: 'media', content: <img alt="rendered output" src="blob:x" /> }}
        captionColor={textColors.metadata}
      />,
    )
    expect(screen.getByAltText('rendered output')).toBeInTheDocument()
    expect(screen.getByTestId('node-state-media-block')).not.toHaveTextContent('image output')
  })

  it('omits the caption when there is nothing to say', () => {
    render(<NodeStateBody detail={{ kind: 'media' }} captionColor={textColors.typeAnnotation} />)
    expect(screen.queryByTestId('node-state-caption')).toBeNull()
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
    expect(screen.getByTestId('node-error-name')).toHaveTextContent('ImageRenderError')
    expect(screen.getByTestId('node-error-message')).toHaveTextContent(
      'Unsupported colour profile in markdown asset at line 4.',
    )
  })

  it('offers View trace and Retry node, and calls back', async () => {
    const onViewTrace = vi.fn()
    const onRetry = vi.fn()
    render(
      <NodeStateBody
        detail={{ kind: 'failed', errorName: 'E', message: 'm', onViewTrace, onRetry }}
        captionColor={textColors.typeAnnotation}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'View trace' }))
    await userEvent.click(screen.getByRole('button', { name: 'Retry node' }))
    expect(onViewTrace).toHaveBeenCalledTimes(1)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  /**
   * `3B` column 2: "Retry node dims the moment it is pressed." The dim is not decoration — the
   * decision table puts these two in the column that gets no loader precisely because the node
   * header reports the retry, and a button that still responded would let a second retry through.
   */
  it('stops both footer actions responding while the retry is under way', async () => {
    const onViewTrace = vi.fn()
    const onRetry = vi.fn()
    render(
      <NodeStateBody
        detail={{
          kind: 'failed',
          errorName: 'E',
          message: 'm',
          onViewTrace,
          onRetry,
          retrying: true,
        }}
        captionColor={textColors.typeAnnotation}
      />,
    )

    const viewTrace = screen.getByRole('button', { name: 'View trace' })
    const retry = screen.getByRole('button', { name: 'Retry node' })
    expect(viewTrace).toBeDisabled()
    expect(retry).toBeDisabled()

    await userEvent.click(viewTrace)
    await userEvent.click(retry)
    expect(onViewTrace).not.toHaveBeenCalled()
    expect(onRetry).not.toHaveBeenCalled()
  })

  /**
   * Not a style assertion: `nodrag` is React Flow's own opt-out hook, and without it a press on
   * either action reaches the node's drag handler and starts dragging the card underneath it.
   * `NodeOutputSlot`'s `inspect` carries it for the same reason.
   */
  it('keeps both footer actions out of the card drag', () => {
    render(
      <NodeStateBody
        detail={{ kind: 'failed', errorName: 'E', message: 'm' }}
        captionColor={textColors.typeAnnotation}
      />,
    )

    expect(screen.getByTestId('node-view-trace')).toHaveClass('nodrag')
    expect(screen.getByTestId('node-retry')).toHaveClass('nodrag')
  })
})

/**
 * The same row serves both artboards: `Node states` ok is 10px with an 8px gap (design 714), the
 * in-canvas slot's caption row is 9.5px with a 10px gap (204). The sizes are the stylesheet's now;
 * what stays asserted here is the content — the parts in order, separated, and nothing leading.
 */
describe('MetadataRow', () => {
  it('renders its parts in order, separated by the design middot', () => {
    render(<MetadataRow parts={['1024×1024', 'png', '412 kb']} />)
    expect(screen.getByTestId('node-metadata-row')).toHaveTextContent('1024×1024 · png · 412 kb')
  })

  it('leads with the first part rather than with a separator', () => {
    render(<MetadataRow parts={['png', '412 kb']} />)
    expect(screen.getByTestId('node-metadata-row').textContent).toBe('png · 412 kb')
  })

  it('renders a single part with no separator at all', () => {
    render(<MetadataRow parts={['412 kb']} />)
    expect(screen.getByTestId('node-metadata-row').textContent).toBe('412 kb')
  })

  it('passes the slot caption row’s size and gap through as the properties the rule reads', () => {
    render(<MetadataRow parts={['png', '412 kb']} fontSize={9.5} gap={10} />)
    const row = screen.getByTestId('node-metadata-row')
    expect(row.style.getPropertyValue('--jbk-metadata-row-size')).toBe('9.5px')
    expect(row.style.getPropertyValue('--jbk-metadata-row-gap')).toBe('10px')
  })
})
