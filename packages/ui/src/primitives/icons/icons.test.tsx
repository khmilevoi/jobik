import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CheckIcon } from './CheckIcon.js'
import { CloseIcon } from './CloseIcon.js'
import { CopyIcon } from './CopyIcon.js'
import { DownloadIcon } from './DownloadIcon.js'

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
describe('the four Studio icons', () => {
  it('renders each icon hidden from the accessibility tree', () => {
    render(
      <>
        <CopyIcon data-testid="copy" />
        <CheckIcon data-testid="check" />
        <DownloadIcon data-testid="download" />
        <CloseIcon data-testid="close" />
      </>,
    )
    for (const id of ['copy', 'check', 'download', 'close']) {
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
})
