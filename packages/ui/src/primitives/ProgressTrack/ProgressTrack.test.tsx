import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ProgressTrack } from './ProgressTrack.js'

afterEach(cleanup)

describe('ProgressTrack', () => {
  it('reports the percentage it draws', () => {
    render(<ProgressTrack value={42} label="cover.png" />)
    const bar = screen.getByRole('progressbar', { name: 'cover.png' })
    expect(bar).toHaveAttribute('aria-valuenow', '42')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
  })

  it('carries the width as the custom property the stylesheet reads', () => {
    render(<ProgressTrack value={42} label="cover.png" data-testid="track" />)
    const fill = screen.getByTestId('track').firstElementChild as HTMLElement
    expect(fill.style.getPropertyValue('--jbk-progress-value')).toBe('42%')
  })
})
