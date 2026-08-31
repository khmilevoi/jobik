import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Checkbox } from './Checkbox.js'

afterEach(cleanup)

describe('Checkbox', () => {
  it('is a checkbox to a reader, named by its label', () => {
    render(<Checkbox checked label="cover.png" />)
    expect(screen.getByRole('checkbox', { name: 'cover.png' })).toBeChecked()
  })

  it('reports the value it is being moved to, not the one it holds', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<Checkbox checked={false} label="thumb.png" onChange={onChange} />)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenCalledWith(true)

    rerender(<Checkbox checked label="thumb.png" onChange={onChange} />)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('draws the check only when it is checked', () => {
    const { container, rerender } = render(<Checkbox checked={false} label="thumb.png" />)
    expect(container.querySelector('svg')).toBeNull()

    rerender(<Checkbox checked label="thumb.png" />)
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('does not respond when disabled', async () => {
    const onChange = vi.fn()
    render(<Checkbox checked={false} label="thumb.png" onChange={onChange} disabled />)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
