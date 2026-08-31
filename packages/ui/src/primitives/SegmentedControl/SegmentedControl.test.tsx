import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SegmentedControl } from './SegmentedControl.js'

afterEach(cleanup)

const FORMATS = [
  { value: 'png', label: 'png' },
  { value: 'webp', label: 'webp' },
  { value: 'jpg', label: 'jpg' },
] as const

describe('SegmentedControl', () => {
  it('is a named radio group with one option selected', () => {
    render(<SegmentedControl options={FORMATS} value="png" label="Format" />)
    screen.getByRole('radiogroup', { name: 'Format' })
    expect(screen.getByRole('radio', { name: 'png' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'webp' })).not.toBeChecked()
  })

  it('reports the option pressed', async () => {
    const onChange = vi.fn()
    render(<SegmentedControl options={FORMATS} value="png" label="Format" onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'webp' }))
    expect(onChange).toHaveBeenCalledWith('webp')
  })

  it('does not respond when disabled', async () => {
    const onChange = vi.fn()
    render(
      <SegmentedControl
        options={FORMATS}
        value="png"
        label="Format"
        onChange={onChange}
        disabled
      />,
    )
    await userEvent.click(screen.getByRole('radio', { name: 'jpg' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  /** Two controls on one page must not capture each other's presses. */
  it('gives each instance its own radio group', () => {
    render(
      <>
        <SegmentedControl options={FORMATS} value="png" label="Format one" />
        <SegmentedControl options={FORMATS} value="webp" label="Format two" />
      </>,
    )
    const [first, second] = screen.getAllByRole('radiogroup')
    const nameOf = (group: HTMLElement) =>
      (group.querySelector('input') as HTMLInputElement).getAttribute('name')
    expect(nameOf(first as HTMLElement)).not.toBe(nameOf(second as HTMLElement))
  })
})
