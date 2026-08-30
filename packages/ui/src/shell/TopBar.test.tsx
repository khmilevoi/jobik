import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TopBar } from './TopBar.js'

afterEach(cleanup)

describe('TopBar', () => {
  it('draws the 52px bar with a 16px gap when nothing is docked', () => {
    render(<TopBar flowName="publication" flowFile="flow.ts" dirty />)
    const bar = screen.getByTestId('studio-top-bar')
    expect(bar.style.height).toBe('52px')
    expect(bar.style.flex).toBe('0 0 auto')
    expect(bar.style.background).toBe('rgb(11, 12, 14)')
    expect(bar.style.borderBottom).toBe('1px solid rgb(23, 25, 28)')
    expect(bar.style.padding).toBe('0px 16px')
    expect(bar.style.gap).toBe('16px')
  })

  it('draws the accent-outlined wordmark', () => {
    render(<TopBar flowName="publication" flowFile="flow.ts" dirty={false} />)
    const square = screen.getByTestId('studio-wordmark-square')
    expect(square.style.width).toBe('14px')
    expect(square.style.height).toBe('14px')
    expect(square.style.borderRadius).toBe('3px')
    expect(square.getAttribute('style')).toContain('1.5px solid var(--accent, #1fd6bd)')
    const word = screen.getByText('jobik')
    expect(word.style.fontSize).toBe('14px')
    expect(word.style.fontWeight).toBe('600')
    expect(word.style.letterSpacing).toBe('0.01em')
  })

  it('shows the flow name with its mono file badge and the long dirty label', () => {
    render(<TopBar flowName="publication" flowFile="flow.ts" dirty />)
    expect(screen.getByText('publication').style.fontSize).toBe('13px')
    expect(screen.getByText('flow.ts')).toBeInTheDocument()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    const dot = screen.getByTestId('studio-dirty-dot')
    expect(dot.style.width).toBe('5px')
    expect(dot.style.background).toBe('rgb(138, 125, 74)')
    expect(dot.style.borderRadius).toBe('50%')
    expect(screen.getByTestId('studio-dirty').style.marginLeft).toBe('2px')
  })

  it('hides the dirty indicator when the flow is clean', () => {
    render(<TopBar flowName="publication" flowFile="flow.ts" dirty={false} />)
    expect(screen.queryByTestId('studio-dirty-dot')).not.toBeInTheDocument()
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
  })

  it('goes compact when a panel control is docked into it', () => {
    render(
      <TopBar
        flowName="publication"
        flowFile="flow.ts"
        dirty
        dockedLeft={<div data-testid="docked-left" />}
        dockedRight={<div data-testid="docked-right" />}
      />,
    )
    expect(screen.getByTestId('studio-top-bar').style.gap).toBe('14px')
    expect(screen.queryByText('flow.ts')).not.toBeInTheDocument()
    expect(screen.getByText('Unsaved')).toBeInTheDocument()
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
    expect(screen.getByTestId('docked-left')).toBeInTheDocument()
    expect(screen.getByTestId('docked-right')).toBeInTheDocument()
    expect(screen.getByTestId('studio-dirty').style.marginLeft).toBe('')
  })

  it('goes compact and renders whatever fills the running chip slot', () => {
    render(
      <TopBar
        flowName="publication"
        flowFile="flow.ts"
        dirty={false}
        running
        runningChip={<div data-testid="running-chip" />}
      />,
    )
    expect(screen.getByTestId('studio-top-bar').style.gap).toBe('14px')
    expect(screen.queryByText('flow.ts')).not.toBeInTheDocument()
    expect(screen.getByTestId('running-chip')).toBeInTheDocument()
  })

  it('dims and disables the actions while a run is in progress', async () => {
    const onSave = vi.fn()
    render(<TopBar flowName="publication" flowFile="flow.ts" dirty running onSave={onSave} />)
    expect(screen.getByTestId('studio-top-bar-actions').style.opacity).toBe('0.45')
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    await userEvent.click(save)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('fires onValidate and onSave when idle', async () => {
    const onValidate = vi.fn()
    const onSave = vi.fn()
    render(
      <TopBar
        flowName="publication"
        flowFile="flow.ts"
        dirty
        onValidate={onValidate}
        onSave={onSave}
      />,
    )
    expect(screen.getByTestId('studio-top-bar-actions').style.opacity).toBe('1')
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onValidate).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledTimes(1)
  })
})
