import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ImageFrame } from './ImageFrame.js'

afterEach(cleanup)

describe('ImageFrame', () => {
  it('shows the striped placeholder and a centred mono label when no url is known', () => {
    render(<ImageFrame variant="primary" label="cover.png" data-testid="frame" />)
    const frame = screen.getByTestId('frame')
    expect(frame).toHaveTextContent('cover.png')
    expect(frame.querySelector('svg')).not.toBeNull()
  })

  it('shows a centred label for a variant tile too', () => {
    render(<ImageFrame variant="variant" label="og.png" data-testid="frame" />)
    expect(screen.getByTestId('image-frame-label')).toHaveTextContent('og.png')
  })

  it("keeps the placeholder and the label in the dock's growing frame", () => {
    render(<ImageFrame variant="primaryFill" label="cover.png" data-testid="frame" />)
    const frame = screen.getByTestId('frame')
    expect(screen.getByTestId('image-frame-label')).toHaveTextContent('cover.png')
    expect(frame.querySelector('svg')).not.toBeNull()
  })

  it('renders the image and no placeholder once a url is known', () => {
    render(<ImageFrame variant="primary" label="cover.png" src="/assets/a1" data-testid="frame" />)
    const image = screen.getByAltText('cover.png')
    expect(image).toHaveAttribute('src', '/assets/a1')
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
