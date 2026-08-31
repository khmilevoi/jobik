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
