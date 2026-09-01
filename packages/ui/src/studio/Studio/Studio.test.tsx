import { cleanup, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Studio } from './Studio.js'

afterEach(cleanup)

describe('Studio', () => {
  it('opens with both panels expanded and nothing docked', () => {
    render(<Studio flowFile="index.ts" />)
    expect(screen.getByTestId('studio-frame')).toBeInTheDocument()
    expect(screen.getByTestId('studio-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('studio-dock')).toBeInTheDocument()
    expect(screen.getByTestId('studio-flow-file')).toHaveTextContent('index.ts')
    expect(screen.queryByRole('button', { name: 'Expand flows and nodes' })).not.toBeInTheDocument()
  })

  /**
   * The file name reaches the Studio from the flow descriptor, and the descriptor is absent for the
   * whole initial-load frame. A default here would print a name no file on disk carries — the
   * showcase flow's own entrypoint is `index.ts`, never `flow.ts` — and a plausible wrong answer is
   * indistinguishable from a right one. So the badge is omitted until a name actually arrives.
   */
  it('prints no file name at all when none was supplied', () => {
    render(<Studio />)
    expect(screen.queryByTestId('studio-flow-file')).toBeNull()
    expect(screen.queryByText('flow.ts')).toBeNull()
    // The flow is still named; only the file badge is missing.
    expect(
      within(screen.getByTestId('studio-top-bar')).getByText('publication'),
    ).toBeInTheDocument()
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
    render(<Studio flowFile="index.ts" />)
    await userEvent.click(screen.getByRole('button', { name: 'Collapse flows and nodes' }))
    expect(screen.queryByTestId('studio-sidebar')).not.toBeInTheDocument()
    expect(screen.queryByTestId('studio-flow-file')).toBeNull()
    expect(screen.getByText('Unsaved')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Expand flows and nodes' }))
    expect(screen.getByTestId('studio-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('studio-flow-file')).toHaveTextContent('index.ts')
  })

  it('docks the run panel into the top bar and brings it back', async () => {
    // The run control is in the top bar in BOTH states — `2A` draws it there with the dock open —
    // so its presence no longer distinguishes them. What distinguishes them is the expand
    // affordance: collapsed, the label is the button that brings the dock back; open, the label is
    // inert text and only the accent `Run` chip acts.
    render(<Studio />)
    expect(screen.getByTestId('studio-dock')).toBeInTheDocument()
    expect(screen.getByTestId('studio-docked-run')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Expand run panel' })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Collapse run panel' }))
    expect(screen.queryByTestId('studio-dock')).not.toBeInTheDocument()
    expect(screen.getByTestId('studio-docked-run')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Expand run panel' }))
    expect(screen.getByTestId('studio-dock')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Expand run panel' })).toBeNull()
  })

  /**
   * `Studio — run in progress` (design 1706–1714) draws the running pill, `Validate` and `Save`,
   * and no `Run start1` pill: while a run streams the chip is the run affordance, and a second one
   * beside it would offer a second run over the first.
   */
  it('withdraws the top-bar run pill while a run streams', () => {
    render(<Studio running runningChip={<div data-testid="running-chip" />} />)
    expect(screen.getByTestId('running-chip')).toBeInTheDocument()
    expect(screen.queryByTestId('studio-docked-run')).toBeNull()
    expect(screen.getByTestId('studio-dock')).toBeInTheDocument()
  })

  /**
   * Collapsed, the same control is the dock's expand affordance, so it stays drawn — and `3B` then
   * applies: a run in flight already reports progress, so the accent chip dims and answers nothing.
   */
  it('blocks the docked run chip while a run streams', async () => {
    const onRun = vi.fn()
    render(<Studio running onRun={onRun} runningChip={<div data-testid="running-chip" />} />)
    await userEvent.click(screen.getByRole('button', { name: 'Collapse run panel' }))
    expect(screen.getByTestId('studio-docked-run')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(onRun).not.toHaveBeenCalled()
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
