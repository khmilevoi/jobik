import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Toggle } from './Toggle.js'

afterEach(cleanup)

describe('Toggle', () => {
  it('is a switch to a reader, named by its label', () => {
    render(<Toggle checked label="Bundle as zip" />)
    const toggle = screen.getByRole('switch', { name: 'Bundle as zip' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(toggle).toHaveAttribute('type', 'button')
  })

  it('reports the value it is being moved to', async () => {
    const onChange = vi.fn()
    render(<Toggle checked label="Bundle as zip" onChange={onChange} />)
    await userEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('does not respond when disabled', async () => {
    const onChange = vi.fn()
    render(<Toggle checked={false} label="Bundle as zip" onChange={onChange} disabled />)
    await userEvent.click(screen.getByRole('switch'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
