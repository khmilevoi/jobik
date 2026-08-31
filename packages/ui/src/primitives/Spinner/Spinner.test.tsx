import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Spinner } from './Spinner.js'

afterEach(cleanup)

/**
 * The ring's geometry, its track alpha and its `jspin` timing all live in `Spinner.module.css`,
 * where `cssModuleValues.test.ts` guards the values and the design file says whether they are
 * right. jsdom applies no stylesheet, so reading an `animation` string back out of the DOM here
 * would assert nothing.
 *
 * What is behaviour: the ring is hidden from assistive technology — the control around it swaps
 * its label to the working one and that label is the only thing that should be announced.
 */
describe('Spinner', () => {
  it('renders a decorative ring the accessibility tree never sees', () => {
    render(<Spinner data-testid="spinner" />)
    expect(screen.getByTestId('spinner')).toHaveAttribute('aria-hidden', 'true')
  })

  it('accepts a caller class beside its own', () => {
    render(<Spinner size={11} className="host" data-testid="spinner" />)
    expect(screen.getByTestId('spinner')).toHaveClass('host')
  })
})
