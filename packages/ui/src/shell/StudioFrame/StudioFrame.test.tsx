import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StudioFrame } from './StudioFrame.js'

afterEach(cleanup)

describe('StudioFrame', () => {
  it('draws the frame and publishes the default accent', () => {
    render(
      <StudioFrame
        topBar={<div data-testid="top" />}
        canvas={<div data-testid="canvas" />}
        left={<div data-testid="left" />}
        right={<div data-testid="right" />}
      />,
    )
    const frame = screen.getByTestId('studio-frame')
    expect(frame).toHaveAttribute('data-jobik-studio')
    expect(frame.style.getPropertyValue('--accent')).toBe('#1fd6bd')
  })

  it('renders the global stylesheet exactly once', () => {
    render(<StudioFrame topBar={<div />} canvas={<div />} />)
    expect(document.querySelectorAll('style[data-jobik-styles]')).toHaveLength(1)
  })

  it('accepts one of the design alternates as the accent', () => {
    render(<StudioFrame accent="#3ecf8e" topBar={<div />} canvas={<div />} />)
    expect(screen.getByTestId('studio-frame').style.getPropertyValue('--accent')).toBe('#3ecf8e')
  })

  it('lays the body out with the topBar and canvas both present', () => {
    render(<StudioFrame topBar={<div />} canvas={<div data-testid="canvas" />} />)
    expect(screen.getByTestId('studio-body')).toBeInTheDocument()
    expect(screen.getByTestId('canvas')).toBeInTheDocument()
  })

  it('omits a collapsed panel entirely rather than shrinking it', () => {
    const { rerender } = render(
      <StudioFrame
        topBar={<div />}
        canvas={<div />}
        left={<div data-testid="left" />}
        right={<div data-testid="right" />}
      />,
    )
    expect(screen.getByTestId('left')).toBeInTheDocument()
    expect(screen.getByTestId('right')).toBeInTheDocument()

    rerender(<StudioFrame topBar={<div />} canvas={<div />} />)
    expect(screen.queryByTestId('left')).not.toBeInTheDocument()
    expect(screen.queryByTestId('right')).not.toBeInTheDocument()
  })
})
