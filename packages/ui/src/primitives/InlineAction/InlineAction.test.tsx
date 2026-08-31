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
