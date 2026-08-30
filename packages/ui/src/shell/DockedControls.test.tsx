import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DockedFlowsControl, DockedRunControl } from './DockedControls.js'

afterEach(cleanup)

describe('DockedFlowsControl', () => {
  it('is one chip-shaped button with a right-pointing chevron', async () => {
    const onExpand = vi.fn()
    const { container } = render(<DockedFlowsControl onExpand={onExpand} />)
    const button = screen.getByRole('button', { name: 'Expand flows and nodes' })
    expect(button.style.height).toBe('28px')
    expect(button.style.padding).toBe('0px 10px')
    expect(button.style.gap).toBe('7px')
    expect(button.style.border).toBe('1px solid rgb(33, 37, 40)')
    expect(button.style.background).toBe('rgb(14, 16, 18)')
    expect(container.querySelector('path')).toHaveAttribute('d', 'M3.5 1 7 4.5 3.5 8')
    expect(screen.getByText('Flows & nodes').style.fontSize).toBe('11.5px')
    await userEvent.click(button)
    expect(onExpand).toHaveBeenCalledTimes(1)
  })
})

describe('DockedRunControl', () => {
  it('separates the expand affordance from the accent Run button', async () => {
    const onExpand = vi.fn()
    const onRun = vi.fn()
    render(<DockedRunControl entryNodeId="start1" onExpand={onExpand} onRun={onRun} />)

    const chip = screen.getByTestId('studio-docked-run')
    expect(chip.style.height).toBe('28px')
    expect(chip.style.padding).toBe('0px 4px 0px 10px')
    expect(chip.style.gap).toBe('8px')

    const expand = screen.getByRole('button', { name: 'Expand run panel' })
    const run = screen.getByRole('button', { name: 'Run' })
    expect(expand).not.toBe(run)
    expect(run.style.height).toBe('20px')
    expect(run.style.borderRadius).toBe('3px')

    await userEvent.click(expand)
    expect(onExpand).toHaveBeenCalledTimes(1)
    expect(onRun).not.toHaveBeenCalled()

    await userEvent.click(run)
    expect(onRun).toHaveBeenCalledTimes(1)
    expect(onExpand).toHaveBeenCalledTimes(1)
  })

  it('prints the entry id in accent mono inside the label', () => {
    render(<DockedRunControl entryNodeId="start1" onExpand={() => {}} />)
    const entry = screen.getByText('start1')
    expect(entry.style.fontFamily).toContain('JetBrains Mono')
    expect(entry.getAttribute('style')).toContain('var(--accent, #1fd6bd)')
  })
})
