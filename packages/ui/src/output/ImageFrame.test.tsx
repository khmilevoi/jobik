import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { canvasColors } from '../canvas/canvasTokens.js'
import { borders, radii, surfaces, textColors } from '../tokens.js'
import { ImageFrame } from './ImageFrame.js'

afterEach(cleanup)

describe('ImageFrame', () => {
  it('is a 236px frame with the control border and the artboard-only radius 6', () => {
    render(<ImageFrame variant="primary" label="cover.png" data-testid="frame" />)
    expect(screen.getByTestId('frame')).toHaveStyle({
      height: '236px',
      borderRadius: '6px',
      border: `1px solid ${borders.control}`,
      background: surfaces.imagePlaceholder,
      overflow: 'hidden',
      position: 'relative',
    })
  })

  it('is a 112px frame with the inset border and the control radius as a variant', () => {
    render(<ImageFrame variant="variant" label="og.png" data-testid="frame" />)
    expect(screen.getByTestId('frame')).toHaveStyle({
      height: '112px',
      borderRadius: `${radii.control}px`,
      border: `1px solid ${borders.inset}`,
    })
  })

  it('shows the striped placeholder and a centred mono label when no url is known', () => {
    render(<ImageFrame variant="primary" label="cover.png" data-testid="frame" />)
    const frame = screen.getByTestId('frame')
    expect(frame).toHaveTextContent('cover.png')
    expect(frame.querySelector('svg')).not.toBeNull()
    const label = screen.getByTestId('image-frame-label')
    expect(label.style.fontSize).toBe('10px')
    expect(label.style.letterSpacing).toBe('0.08em')
    expect(label).toHaveStyle({ color: canvasColors.slotCaption })
  })

  it('drops the label a step for a variant tile', () => {
    render(<ImageFrame variant="variant" label="og.png" data-testid="frame" />)
    const label = screen.getByTestId('image-frame-label')
    expect(label.style.fontSize).toBe('9.5px')
    expect(label).toHaveStyle({ color: textColors.sectionLabel })
  })

  it('renders the image and no placeholder once a url is known', () => {
    render(<ImageFrame variant="primary" label="cover.png" src="/assets/a1" data-testid="frame" />)
    const image = screen.getByAltText('cover.png')
    expect(image).toHaveAttribute('src', '/assets/a1')
    expect(image).toHaveStyle({ width: '100%', height: '100%', objectFit: 'cover' })
    expect(screen.queryByTestId('image-frame-label')).toBeNull()
  })

  it('renders an overlay over either state', () => {
    render(
      <ImageFrame
        variant="primary"
        label="cover.png"
        overlay={<span>1 / 3</span>}
        data-testid="frame"
      />,
    )
    expect(screen.getByTestId('frame')).toHaveTextContent('1 / 3')
  })
})
