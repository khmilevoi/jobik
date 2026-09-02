import { cleanup, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Studio } from './Studio.js'

afterEach(cleanup)

describe('Studio', () => {
  it('opens with both panels expanded and both toggle buttons in the bar', () => {
    render(<Studio flowFile="index.ts" />)
    expect(screen.getByTestId('studio-frame')).toBeInTheDocument()
    expect(screen.getByTestId('studio-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('studio-dock')).toBeInTheDocument()
    expect(screen.getByTestId('studio-flow-file')).toHaveTextContent('index.ts')
    // Both toggles live in the top bar, permanently — see `TopBar`'s doc comment — named by what
    // they currently do: with both panels open, both read `Collapse …`.
    expect(
      within(screen.getByTestId('studio-top-bar')).getByRole('button', {
        name: 'Collapse flows and nodes',
      }),
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId('studio-top-bar')).getByRole('button', {
        name: 'Collapse run panel',
      }),
    ).toBeInTheDocument()
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
    expect(screen.getByTestId('studio-start-row-start1')).toBeInTheDocument()
    expect(screen.getByTestId('studio-inventory-row-httpSink')).toBeInTheDocument()
  })

  it('docks the left panel into the top bar and brings it back, from one toggle button', async () => {
    render(<Studio flowFile="index.ts" />)
    await userEvent.click(screen.getByRole('button', { name: 'Collapse flows and nodes' }))
    // `4A` keeps the panel mounted so its container's width can ease; collapsed, the slot is
    // `aria-hidden` and `inert`, so nothing inside it is reachable or announced.
    expect(screen.getByTestId('studio-left-panel')).toHaveAttribute('aria-hidden', 'true')
    // Same button, renamed to say what it does next — not a second, docked control.
    expect(screen.queryByRole('button', { name: 'Collapse flows and nodes' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Expand flows and nodes' })).toBeInTheDocument()
    // Collapsing a panel is purely a layout choice — the rest of the bar, including the file badge
    // and the full "Unsaved changes" label, stays exactly as it was.
    expect(screen.getByTestId('studio-flow-file')).toHaveTextContent('index.ts')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Expand flows and nodes' }))
    expect(screen.getByTestId('studio-left-panel')).not.toHaveAttribute('aria-hidden')
    expect(screen.getByTestId('studio-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('studio-flow-file')).toHaveTextContent('index.ts')
  })

  it('collapses and expands the run panel from one toggle button, keeping the run pill live throughout', async () => {
    render(<Studio />)
    expect(screen.getByTestId('studio-dock')).toBeInTheDocument()
    // The run pill is the only way to start a run, so it stays in the bar whether the dock is open
    // or collapsed — only a streaming run (`running`) withdraws it, see the test below.
    expect(screen.getByTestId('studio-docked-run')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Collapse run panel' }))
    expect(screen.getByTestId('studio-right-panel')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('button', { name: 'Collapse run panel' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Expand run panel' })).toBeInTheDocument()
    expect(screen.getByTestId('studio-docked-run')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Expand run panel' }))
    expect(screen.getByTestId('studio-right-panel')).not.toHaveAttribute('aria-hidden')
    expect(screen.getByTestId('studio-dock')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Expand run panel' })).toBeNull()
    expect(screen.getByTestId('studio-docked-run')).toBeInTheDocument()
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
   * Both toggle buttons stay in the bar and stay live while a run streams — panel visibility is a
   * layout choice, independent of whether the surface is busy — even though the run pill itself
   * is withdrawn for the run's whole duration (see above).
   */
  it('keeps both panel toggles working while a run streams', async () => {
    render(<Studio running runningChip={<div data-testid="running-chip" />} />)
    await userEvent.click(screen.getByRole('button', { name: 'Collapse run panel' }))
    expect(screen.getByTestId('studio-right-panel')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByTestId('studio-docked-run')).toBeNull()
  })

  it('collapses both panels and gives the whole body to the canvas', async () => {
    render(<Studio />)
    await userEvent.click(screen.getByRole('button', { name: 'Collapse flows and nodes' }))
    await userEvent.click(screen.getByRole('button', { name: 'Collapse run panel' }))
    // Both slots are clipped to nothing and neither answers, so the canvas is the only thing in
    // the body a user can see or reach.
    expect(screen.getByTestId('studio-left-panel')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByTestId('studio-right-panel')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByTestId('studio-canvas-slot')).toBeInTheDocument()
  })

  it('runs from the open dock’s pill', async () => {
    const onRun = vi.fn()
    render(<Studio onRun={onRun} />)
    await userEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(onRun).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('studio-right-panel')).not.toHaveAttribute('aria-hidden')
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
