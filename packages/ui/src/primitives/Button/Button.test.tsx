import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Button } from './Button.js'

afterEach(cleanup)

/**
 * What is left of this file after the seven `(variant, size)` cells moved into
 * `Button.module.css`.
 *
 * Every assertion that pinned a padding, a border, a radius, a font size or a colour is gone: it
 * restated the stylesheet, and once the stylesheet exists the restatement can only drift from it.
 * `cssModuleUsage.test.ts` catches a mistyped cell, `cssModuleValues.test.ts` catches an invented
 * value, and the design file is what says the cell is right. None of that is something a jsdom
 * render can check.
 *
 * What remains is the part that is genuinely behaviour: the element it renders, the conditional
 * `hint`, and the click contract.
 */
describe('Button', () => {
  it('renders a non-submitting button carrying its label', () => {
    render(
      <Button variant="quiet" size="lg">
        Validate
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Validate' })
    // `type="button"` is behaviour, not appearance: without it the button submits a surrounding
    // form.
    expect(button).toHaveAttribute('type', 'button')
  })

  it('renders the mono hint only when one is supplied', () => {
    const { rerender } = render(
      <Button variant="accent" size="lg" hint="CMD-ENTER">
        Run start1
      </Button>,
    )
    expect(screen.getByText('CMD-ENTER')).toBeInTheDocument()

    rerender(
      <Button variant="accent" size="lg">
        Run start1
      </Button>,
    )
    expect(screen.queryByText('CMD-ENTER')).not.toBeInTheDocument()
  })

  it('fires onClick and honours disabled', async () => {
    const onClick = vi.fn()
    const { rerender } = render(
      <Button variant="quiet" size="lg" onClick={onClick}>
        Validate
      </Button>,
    )
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)

    rerender(
      <Button variant="quiet" size="lg" onClick={onClick} disabled>
        Validate
      </Button>,
    )
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
