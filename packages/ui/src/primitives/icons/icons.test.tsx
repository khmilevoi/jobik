import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CheckIcon } from './CheckIcon.js'
import { CloseIcon } from './CloseIcon.js'
import { CopyIcon } from './CopyIcon.js'
import { DownloadIcon } from './DownloadIcon.js'
import { PanelLeftIcon } from './PanelLeftIcon.js'
import { PanelRightIcon } from './PanelRightIcon.js'

afterEach(cleanup)

/**
 * What can honestly be asserted about an icon in jsdom.
 *
 * The path data is the design's, verbatim, and a test that restated it would only be a second copy
 * of the same string — `01-foundations.md` §7 is the source of truth for that. What is genuinely
 * behaviour is the pair of contracts every control in `3A` depends on: an icon is decorative
 * (`aria-hidden`, so the button's own label is the only accessible name), and it renders at the
 * size and weight its host asks for, because the same check is drawn at 9, 10 and 11 px and at
 * three stroke weights.
 */
describe('the six Studio icons', () => {
  it('renders each icon hidden from the accessibility tree', () => {
    render(
      <>
        <CopyIcon data-testid="copy" />
        <CheckIcon data-testid="check" />
        <DownloadIcon data-testid="download" />
        <CloseIcon data-testid="close" />
        <PanelLeftIcon data-testid="panel-left" />
        <PanelRightIcon data-testid="panel-right" />
      </>,
    )
    for (const id of ['copy', 'check', 'download', 'close', 'panel-left', 'panel-right']) {
      expect(screen.getByTestId(id)).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('draws at the size the host control asks for, from an unchanged viewBox', () => {
    render(<CheckIcon size={11} data-testid="check" />)
    const svg = screen.getByTestId('check')
    expect(svg).toHaveAttribute('width', '11')
    expect(svg).toHaveAttribute('height', '11')
    expect(svg).toHaveAttribute('viewBox', '0 0 10 10')
  })

  it('takes the stroke weight its context needs', () => {
    const { rerender } = render(<CheckIcon data-testid="check" />)
    expect(screen.getByTestId('check').querySelector('path')).toHaveAttribute('stroke-width', '1.4')

    rerender(<CheckIcon strokeWidth={1.6} data-testid="check" />)
    expect(screen.getByTestId('check').querySelector('path')).toHaveAttribute('stroke-width', '1.6')
  })

  /**
   * `PanelLeftIcon` and `PanelRightIcon` draw two shapes: an outline frame that carries
   * `stroke-width`, and a filled pane on one side that has no stroke at all.
   */
  it('draws the panel icons as an outline frame plus a filled pane on the named side', () => {
    render(
      <>
        <PanelLeftIcon data-testid="panel-left" />
        <PanelRightIcon data-testid="panel-right" />
      </>,
    )
    const left = screen.getByTestId('panel-left').querySelectorAll('rect')
    const right = screen.getByTestId('panel-right').querySelectorAll('rect')
    expect(left).toHaveLength(2)
    expect(right).toHaveLength(2)

    expect(left[0]).toHaveAttribute('stroke-width', '1.2')
    expect(left[0]).toHaveAttribute('fill', 'none')
    expect(left[1]).toHaveAttribute('fill', 'currentColor')
    expect(left[1]).toHaveAttribute('x', '1')

    expect(right[0]).toHaveAttribute('stroke-width', '1.2')
    expect(right[1]).toHaveAttribute('fill', 'currentColor')
    expect(right[1]).toHaveAttribute('x', '6')
  })

  it('takes the panel icons’ stroke weight from the frame, not the filled pane', () => {
    const { rerender } = render(<PanelLeftIcon data-testid="panel-left" />)
    const frame = () => screen.getByTestId('panel-left').querySelectorAll('rect')[0]
    expect(frame()).toHaveAttribute('stroke-width', '1.2')

    rerender(<PanelLeftIcon strokeWidth={1.5} data-testid="panel-left" />)
    expect(frame()).toHaveAttribute('stroke-width', '1.5')
  })
})
