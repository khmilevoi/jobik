import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Button } from './Button.js'

afterEach(cleanup)

describe('Button', () => {
  it('renders the quiet lg cell as the top bar draws Validate', () => {
    render(
      <Button variant="quiet" size="lg">
        Validate
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Validate' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button.style.padding).toBe('6px 12px')
    expect(button.style.border).toBe('1px solid rgb(35, 38, 41)')
    expect(button.style.borderRadius).toBe('5px')
    expect(button.style.fontSize).toBe('12px')
    expect(button.style.color).toBe('rgb(174, 181, 187)')
    expect(button.style.height).toBe('')
  })

  it('renders the outlined lg cell as the top bar draws Save', () => {
    render(
      <Button variant="outlined" size="lg">
        Save
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button.style.padding).toBe('6px 14px')
    expect(button.style.border).toBe('1px solid rgb(44, 48, 51)')
    expect(button.style.background).toBe('rgb(22, 24, 26)')
    expect(button.style.fontSize).toBe('12px')
    expect(button.style.fontWeight).toBe('500')
    expect(button.style.color).toBe('rgb(232, 234, 236)')
  })

  it('renders the quiet sm and md cells', () => {
    const { rerender } = render(
      <Button variant="quiet" size="sm">
        Open
      </Button>,
    )
    let button = screen.getByRole('button')
    expect(button.style.height).toBe('24px')
    expect(button.style.padding).toBe('0px 8px')
    expect(button.style.borderRadius).toBe('4px')
    expect(button.style.fontSize).toBe('11px')

    rerender(
      <Button variant="quiet" size="md">
        Copy all
      </Button>,
    )
    button = screen.getByRole('button')
    expect(button.style.height).toBe('26px')
    expect(button.style.padding).toBe('0px 10px')
    expect(button.style.fontSize).toBe('11.5px')
  })

  it('renders the outlined md cell', () => {
    render(
      <Button variant="outlined" size="md">
        Download
      </Button>,
    )
    const button = screen.getByRole('button')
    expect(button.style.height).toBe('26px')
    expect(button.style.borderRadius).toBe('4px')
    expect(button.style.background).toBe('rgb(22, 24, 26)')
  })

  it('renders the accent xs cell through the accent custom property', () => {
    render(
      <Button variant="accent" size="xs">
        Run
      </Button>,
    )
    const button = screen.getByRole('button')
    expect(button.style.height).toBe('20px')
    expect(button.style.borderRadius).toBe('3px')
    expect(button.style.fontWeight).toBe('600')
    expect(button.getAttribute('style')).toContain('var(--accent, #1fd6bd)')
    expect(button.style.color).toBe('rgb(4, 33, 29)')
  })

  it('renders the accent lg cell with its mono hint', () => {
    render(
      <Button variant="accent" size="lg" hint="CMD-ENTER">
        Run start1
      </Button>,
    )
    const button = screen.getByRole('button', { name: /Run start1/ })
    expect(button.style.height).toBe('34px')
    expect(button.style.borderRadius).toBe('5px')
    expect(button.style.fontSize).toBe('12.5px')
    expect(button.style.letterSpacing).toBe('0.01em')
    const hint = screen.getByText('CMD-ENTER')
    expect(hint.style.fontSize).toBe('10px')
    expect(hint.style.color).toBe('rgba(4, 33, 29, 0.6)')
  })

  it('fires onClick and honours disabled', async () => {
    const onClick = vi.fn()
    const { rerender } = render(
      <Button variant="quiet" size="lg" onClick={onClick}>
        Validate
      </Button>,
    )
    // @ts-expect-error userEvent.click exists as direct API in v14+
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)

    rerender(
      <Button variant="quiet" size="lg" onClick={onClick} disabled>
        Validate
      </Button>,
    )
    // @ts-expect-error userEvent.click exists as direct API in v14+
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
