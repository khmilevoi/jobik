import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InlineAction } from './InlineAction.js'

afterEach(cleanup)

describe('InlineAction', () => {
  it('is a real button, so a keyboard can reach it', async () => {
    const onClick = vi.fn()
    render(<InlineAction onClick={onClick}>copy url</InlineAction>)
    const link = screen.getByRole('button', { name: 'copy url' })
    expect(link).toHaveAttribute('type', 'button')

    await userEvent.tab()
    expect(link).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('carries the caller word through every state', () => {
    const { rerender } = render(<InlineAction state="busy">copy url</InlineAction>)
    expect(screen.getByRole('button', { name: 'copy url' })).toBeInTheDocument()

    rerender(<InlineAction state="ok">copied</InlineAction>)
    expect(screen.getByRole('button', { name: 'copied' })).toBeInTheDocument()

    rerender(<InlineAction state="failed">copy failed</InlineAction>)
    expect(screen.getByRole('button', { name: 'copy failed' })).toBeInTheDocument()
  })
})

/** `4A`'s control swap. `Button.test.tsx` explains why the remount is the thing worth asserting. */
describe('InlineAction — the 4A control swap', () => {
  it('remounts the indicator and the text together and keeps the link', () => {
    const { rerender } = render(<InlineAction state="idle">copy url</InlineAction>)
    const frame = screen.getByRole('button')
    const before = frame.firstElementChild

    rerender(<InlineAction state="ok">copied</InlineAction>)

    expect(screen.getByRole('button')).toBe(frame)
    expect(frame.firstElementChild).not.toBe(before)
  })
})
