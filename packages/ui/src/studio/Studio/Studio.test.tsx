import { cleanup, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Studio } from './Studio.js'

afterEach(cleanup)

describe('Studio', () => {
  it('opens with both panels expanded and nothing docked', () => {
    render(<Studio />)
    expect(screen.getByTestId('studio-frame')).toBeInTheDocument()
    expect(screen.getByTestId('studio-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('studio-dock')).toBeInTheDocument()
    expect(screen.getByText('flow.ts')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Expand flows and nodes' })).not.toBeInTheDocument()
  })

  it('renders the artboard fixture in the sidebar', () => {
    render(<Studio />)
    expect(screen.getByTestId('studio-flow-row-publication')).toBeInTheDocument()
    expect(screen.getByTestId('studio-flow-row-digest')).toBeInTheDocument()
    expect(screen.getByTestId('studio-flow-row-backfill')).toBeInTheDocument()
    expect(screen.getByText('Nodes in publication')).toBeInTheDocument()
    expect(screen.getByTestId('studio-node-row-start1')).toBeInTheDocument()
    expect(screen.getByTestId('studio-inventory-row-httpSink')).toBeInTheDocument()
  })

  it('docks the left panel into the top bar and brings it back', async () => {
    render(<Studio />)
    await userEvent.click(screen.getByRole('button', { name: 'Collapse flows and nodes' }))
    expect(screen.queryByTestId('studio-sidebar')).not.toBeInTheDocument()
    expect(screen.queryByText('flow.ts')).not.toBeInTheDocument()
    expect(screen.getByText('Unsaved')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Expand flows and nodes' }))
    expect(screen.getByTestId('studio-sidebar')).toBeInTheDocument()
    expect(screen.getByText('flow.ts')).toBeInTheDocument()
  })

  it('docks the run panel into the top bar and brings it back', async () => {
    render(<Studio />)
    await userEvent.click(screen.getByRole('button', { name: 'Collapse run panel' }))
    expect(screen.queryByTestId('studio-dock')).not.toBeInTheDocument()
    expect(screen.getByTestId('studio-docked-run')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Expand run panel' }))
    expect(screen.getByTestId('studio-dock')).toBeInTheDocument()
    expect(screen.queryByTestId('studio-docked-run')).not.toBeInTheDocument()
  })

  it('collapses both panels and gives the whole body to the canvas', async () => {
    render(<Studio />)
    await userEvent.click(screen.getByRole('button', { name: 'Collapse flows and nodes' }))
    await userEvent.click(screen.getByRole('button', { name: 'Collapse run panel' }))
    expect(screen.getByTestId('studio-body').childElementCount).toBe(1)
    expect(screen.getByTestId('studio-canvas-slot')).toBeInTheDocument()
  })

  it('runs from the docked control without expanding the dock', async () => {
    const onRun = vi.fn()
    render(<Studio onRun={onRun} />)
    await userEvent.click(screen.getByRole('button', { name: 'Collapse run panel' }))
    await userEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(onRun).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('studio-dock')).not.toBeInTheDocument()
  })

  it('lets a later plan fill the canvas and the run panel', () => {
    render(
      <Studio
        canvas={<div data-testid="p7-canvas" />}
        runPanel={<div data-testid="p11-panel" />}
      />,
    )
    expect(screen.getByTestId('p7-canvas')).toBeInTheDocument()
    expect(screen.queryByTestId('studio-canvas-slot')).not.toBeInTheDocument()
    expect(screen.getByTestId('p11-panel')).toBeInTheDocument()
  })

  it('passes the accent through to the frame', () => {
    render(<Studio accent="#c8a24a" />)
    expect(screen.getByTestId('studio-frame').style.getPropertyValue('--accent')).toBe('#c8a24a')
  })

  it('defaults the active flow to the first supplied flow when none is given', () => {
    render(<Studio flows={[{ id: 'alpha', name: 'alpha', nodeCount: 1 }]} />)
    expect(within(screen.getByTestId('studio-top-bar')).getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('Nodes in alpha')).toBeInTheDocument()
  })
})
