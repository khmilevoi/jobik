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
    expect(frame.style.background).toBe('rgb(7, 8, 9)')
    expect(frame.style.border).toBe('1px solid rgb(26, 29, 32)')
    expect(frame.style.borderRadius).toBe('8px')
    expect(frame.style.overflow).toBe('hidden')
    expect(frame.style.flexDirection).toBe('column')
    expect(frame.style.width).toBe('100%')
    expect(frame.style.height).toBe('100%')
    expect(frame.style.fontFamily).toContain('Archivo')
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

  it('lays the body out as a row that may shrink', () => {
    render(<StudioFrame topBar={<div />} canvas={<div data-testid="canvas" />} />)
    const body = screen.getByTestId('studio-body')
    expect(body.style.flex).toBe('1 1 0%')
    expect(body.style.display).toBe('flex')
    expect(body.style.minHeight).toBe('0px')
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
