import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CopyIcon } from '#primitives/icons/CopyIcon.js'
import { IconButton } from './IconButton.js'

afterEach(cleanup)

/**
 * An icon-only control has no text, so its accessible name is the whole of its meaning — that is
 * the part worth testing. The chrome per state lives in the stylesheet, where the discipline gates
 * guard it.
 */
describe('IconButton', () => {
  it('carries its label as both the accessible name and the tooltip', () => {
    render(<IconButton label="Copy" icon={<CopyIcon />} data-testid="copy" />)
    const button = screen.getByRole('button', { name: 'Copy' })
    expect(button).toHaveAttribute('title', 'Copy')
  })

  it('keeps its name through every state, and swaps only what fills the box', () => {
    const { rerender } = render(
      <IconButton label="Copy" icon={<CopyIcon data-testid="copy-icon" />} />,
    )
    expect(screen.getByTestId('copy-icon')).toBeInTheDocument()

    rerender(<IconButton label="Copy" icon={<CopyIcon data-testid="copy-icon" />} state="busy" />)
    expect(screen.queryByTestId('copy-icon')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()

    rerender(<IconButton label="Copy" icon={<CopyIcon data-testid="copy-icon" />} state="failed" />)
    // Foundations §7 lists `!` as a text glyph, not an icon. It is decorative — the name is what
    // a reader gets.
    expect(screen.getByRole('button', { name: 'Copy' })).toHaveTextContent('!')
  })

  it('renders the trailing chip only when the caller supplies one', () => {
    const { rerender } = render(
      <IconButton label="Copy" icon={<CopyIcon />} state="ok" chip="copied" />,
    )
    expect(screen.getByText('copied')).toBeInTheDocument()

    rerender(<IconButton label="Copy" icon={<CopyIcon />} state="ok" />)
    expect(screen.queryByText('copied')).not.toBeInTheDocument()
  })

  it('shows the bare numeral and the bar width only once a percentage exists', () => {
    render(
      <IconButton
        label="Download"
        icon={<CopyIcon />}
        size={26}
        state="progress"
        progress={42}
        data-testid="download"
      />,
    )
    const button = screen.getByTestId('download')
    // `3A` §3.3 draws the numeral with no `%` — the sign would not fit the 26 px box.
    expect(button).toHaveTextContent('42')
    expect(button.textContent).not.toContain('%')
    expect(button.style.getPropertyValue('--jbk-icon-button-progress')).toBe('42%')
  })

  it('stops responding when dimmed', async () => {
    const onClick = vi.fn()
    render(<IconButton label="Download" icon={<CopyIcon />} dimmed onClick={onClick} />)
    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})

/** `4A`'s control swap. `Button.test.tsx` explains why the remount is the thing worth asserting. */
describe('IconButton — the 4A control swap', () => {
  it('remounts the glyph on a state change and keeps the square', () => {
    const { rerender } = render(
      <IconButton label="Copy url" icon={<CopyIcon size={10} />} state="idle" />,
    )
    const frame = screen.getByRole('button', { name: 'Copy url' })
    const before = frame.firstElementChild

    rerender(<IconButton label="Copy url" icon={<CopyIcon size={10} />} state="busy" />)

    expect(screen.getByRole('button', { name: 'Copy url' })).toBe(frame)
    expect(frame.firstElementChild).not.toBe(before)
  })
})
