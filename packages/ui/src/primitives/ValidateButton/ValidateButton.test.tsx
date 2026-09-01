import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { errorCountLabel, ValidateButton } from './ValidateButton.js'

afterEach(cleanup)

/**
 * `3D` §3D.1, as behaviour. Appearance is the discipline gates' job — nothing here reads a
 * computed style — so what is asserted is the copy each cell carries, which parts of the chrome
 * are present, and which press reaches which callback.
 */

describe('ValidateButton', () => {
  it('says Validate and fires onValidate when idle', async () => {
    const onValidate = vi.fn()
    render(<ValidateButton onValidate={onValidate} />)

    const button = screen.getByRole('button', { name: 'Validate' })
    expect(button).toBeEnabled()

    await userEvent.click(button)
    expect(onValidate).toHaveBeenCalledTimes(1)
  })

  it('shows the spinner and the sweep bar while checking, and takes no press', async () => {
    const onValidate = vi.fn()
    render(<ValidateButton state="checking" onValidate={onValidate} />)

    expect(screen.getByText('Validating')).toBeInTheDocument()
    expect(screen.getByTestId('validate-spinner')).toBeInTheDocument()
    expect(screen.getByTestId('validate-sweep')).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeDisabled()

    await userEvent.click(screen.getByRole('button'))
    expect(onValidate).not.toHaveBeenCalled()
  })

  it('shows Valid with the check glyph and no sweep', () => {
    render(<ValidateButton state="valid" />)

    expect(screen.getByText('Valid')).toBeInTheDocument()
    expect(screen.getByTestId('validate-check')).toBeInTheDocument()
    expect(screen.queryByTestId('validate-sweep')).toBeNull()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('counts the errors it was given and opens the report from the invalid cell', async () => {
    const onOpenReport = vi.fn()
    const onValidate = vi.fn()
    render(
      <ValidateButton
        state="invalid"
        errorCount={2}
        onOpenReport={onOpenReport}
        onValidate={onValidate}
      />,
    )

    expect(screen.getByText('2 errors')).toBeInTheDocument()
    expect(screen.getByTestId('validate-report')).toHaveTextContent('report')

    await userEvent.click(screen.getByRole('button'))
    expect(onOpenReport).toHaveBeenCalledTimes(1)
    // The invalid cell is an opener, not a re-check: `Validate` is what the idle cell does.
    expect(onValidate).not.toHaveBeenCalled()
  })

  it('writes one finding in the singular', () => {
    render(<ValidateButton state="invalid" errorCount={1} />)
    expect(screen.getByText('1 error')).toBeInTheDocument()
    expect(errorCountLabel(1)).toBe('1 error')
    expect(errorCountLabel(3)).toBe('3 errors')
  })

  it('stops responding when dimmed', async () => {
    const onValidate = vi.fn()
    render(<ValidateButton dimmed onValidate={onValidate} />)

    const button = screen.getByRole('button', { name: 'Validate' })
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(onValidate).not.toHaveBeenCalled()
  })
})

/**
 * `4A:198` — "90 ms swap in, result holds 4 s, 90 ms swap out". The two ends of that sentence are
 * the `idle → checking` entry and the `valid|invalid → idle` exit, and both are keyed remounts;
 * `Button.test.tsx` explains why the remount is what a jsdom render can check. The resolved cells
 * are deliberately not part of this — `3D:665-666` gives them `jpop` on the shell instead, which
 * replays on its own because the shell's `animation-name` changes with the state class.
 */
describe('ValidateButton — the 4A control swap', () => {
  it('remounts the contents on the swap in and the swap out, and keeps the shell', () => {
    const { rerender } = render(<ValidateButton state="idle" />)
    const frame = screen.getByRole('button')
    const idle = frame.firstElementChild

    rerender(<ValidateButton state="checking" />)
    const checking = frame.firstElementChild
    expect(screen.getByRole('button')).toBe(frame)
    expect(checking).not.toBe(idle)

    rerender(<ValidateButton state="idle" />)
    expect(screen.getByRole('button')).toBe(frame)
    expect(frame.firstElementChild).not.toBe(checking)
  })
})
