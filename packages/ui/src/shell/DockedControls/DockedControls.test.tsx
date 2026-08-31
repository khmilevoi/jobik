import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DockedFlowsControl, DockedRunControl } from './DockedControls.js'

afterEach(cleanup)

describe('DockedFlowsControl', () => {
  it('is one button with a right-pointing chevron', async () => {
    const onExpand = vi.fn()
    const { container } = render(<DockedFlowsControl onExpand={onExpand} />)
    const button = screen.getByRole('button', { name: 'Expand flows and nodes' })
    expect(container.querySelector('path')).toHaveAttribute('d', 'M3.5 1 7 4.5 3.5 8')
    expect(screen.getByText('Flows & nodes')).toBeInTheDocument()
    await userEvent.click(button)
    expect(onExpand).toHaveBeenCalledTimes(1)
  })
})

describe('DockedRunControl', () => {
  it('separates the expand affordance from the accent Run button', async () => {
    const onExpand = vi.fn()
    const onRun = vi.fn()
    render(<DockedRunControl entryNodeId="start1" onExpand={onExpand} onRun={onRun} />)

    expect(screen.getByTestId('studio-docked-run')).toBeInTheDocument()

    const expand = screen.getByRole('button', { name: 'Expand run panel' })
    const run = screen.getByRole('button', { name: 'Run' })
    expect(expand).not.toBe(run)

    await userEvent.click(expand)
    expect(onExpand).toHaveBeenCalledTimes(1)
    expect(onRun).not.toHaveBeenCalled()

    await userEvent.click(run)
    expect(onRun).toHaveBeenCalledTimes(1)
    expect(onExpand).toHaveBeenCalledTimes(1)
  })

  it('prints the entry id inside the label', () => {
    render(<DockedRunControl entryNodeId="start1" onExpand={() => {}} />)
    expect(screen.getByText('start1')).toBeInTheDocument()
  })
})
