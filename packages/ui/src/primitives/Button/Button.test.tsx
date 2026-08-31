import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Button } from './Button.js'

afterEach(cleanup)

/**
 * What is left of this file after the eight `(variant, size)` cells and the four states moved into
 * `Button.module.css`.
 *
 * Every assertion that pinned a padding, a border, a radius, a font size or a colour is gone: it
 * restated the stylesheet, and once the stylesheet exists the restatement can only drift from it.
 * `cssModuleUsage.test.ts` catches a mistyped cell, `cssModuleValues.test.ts` catches an invented
 * value, and the design file is what says the cell is right. None of that is something a jsdom
 * render can check.
 *
 * What remains is the part that is genuinely behaviour: the element it renders, the conditional
 * slots, the click contract, and the two rules `3A` states in prose — the leading slot belongs to
 * the state, and `3B`'s dim means the button stops responding.
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

  /**
   * `3A`'s leading slot belongs to the state, not to the caller. The caller's icon shows while
   * idle; `busy` replaces it with the ring; `ok` replaces it with the check; and the failed cell
   * is explicit that it carries **no icon** at all, because the reader has a label to read
   * instead.
   */
  it('gives the leading slot to the state, and the label always survives it', () => {
    const icon = <span data-testid="copy-icon" />
    const { rerender } = render(
      <Button variant="quiet" size="md" icon={icon}>
        Copy all
      </Button>,
    )
    expect(screen.getByTestId('copy-icon')).toBeInTheDocument()

    rerender(
      <Button variant="quiet" size="md" icon={icon} state="busy">
        Copying
      </Button>,
    )
    expect(screen.queryByTestId('copy-icon')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copying' })).toBeInTheDocument()

    rerender(
      <Button variant="quiet" size="md" icon={icon} state="failed">
        Copy failed
      </Button>,
    )
    expect(screen.queryByTestId('copy-icon')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy failed' })).toBeInTheDocument()
  })

  /**
   * Rule 03: the percentage exists only when the size is known. A `busy` button therefore has no
   * bar to draw, and neither has a `progress` button whose caller could not produce a number —
   * the width is a custom property, and no property means no width to invent.
   */
  it('draws the determinate loader only once a percentage exists', () => {
    const { rerender } = render(
      <Button variant="outlined" size="md" state="busy">
        Preparing
      </Button>,
    )
    // No number means no width — the busy button carries no progress property at all, so there is
    // nothing for the stylesheet to draw a bar from.
    expect(screen.getByRole('button')).not.toHaveAttribute('style')

    rerender(
      <Button variant="outlined" size="md" state="progress" progress={42} meta="42%">
        Downloading
      </Button>,
    )
    const button = screen.getByRole('button')
    expect(button.style.getPropertyValue('--jbk-button-progress')).toBe('42%')
    expect(screen.getByText('42%')).toBeInTheDocument()
  })

  it('reserves the width its longest label needs', () => {
    render(
      <Button variant="quiet" size="md" reserveWidth={106}>
        Copied
      </Button>,
    )
    expect(screen.getByRole('button').style.getPropertyValue('--jbk-button-reserve')).toBe('106px')
  })

  /** `3B`: a dimmed button does not merely fade — it stops responding. */
  it('stops responding when the surrounding surface is the loader', async () => {
    const onClick = vi.fn()
    render(
      <Button variant="accent" size="lg" dimmed onClick={onClick}>
        Re-run start1
      </Button>,
    )
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  /**
   * `trailing` exists because `2A`'s `Show output` puts its chevron after the label, where `hint`
   * and `meta` would have imposed a mono type and a colour of their own.
   */
  it('renders a trailing slot after the label, and only when one is supplied', () => {
    const { rerender } = render(
      <Button variant="quiet" size="xs" trailing={<span data-testid="chevron" />}>
        Show output
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Show output' })
    expect(button.lastElementChild).toBe(screen.getByTestId('chevron'))

    rerender(
      <Button variant="quiet" size="xs">
        Show output
      </Button>,
    )
    expect(screen.queryByTestId('chevron')).not.toBeInTheDocument()
  })

  /** `3C` §1.5 — the destructive primary is the accent primary with the failure hue instead. */
  it('types the modal footer cells the 3C artboard draws', () => {
    render(
      <>
        <Button variant="quiet" size="modal">
          Keep running
        </Button>
        <Button variant="destructive" size="modal">
          Cancel run
        </Button>
        <Button variant="accent" size="modal">
          Re-validate
        </Button>
      </>,
    )
    expect(screen.getByRole('button', { name: 'Keep running' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel run' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Re-validate' })).toBeInTheDocument()
  })

  it('carries no inline style at all when neither dynamic value is supplied', () => {
    render(
      <Button variant="panel" size="lg">
        Copy log
      </Button>,
    )
    expect(screen.getByRole('button')).not.toHaveAttribute('style')
  })
})
