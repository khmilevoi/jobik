import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TopBar } from './TopBar.js'

afterEach(cleanup)

function renderBar(overrides: Partial<Parameters<typeof TopBar>[0]> = {}) {
  return render(
    <TopBar
      flowName="publication"
      flowFile="flow.ts"
      dirty
      leftCollapsed={false}
      onToggleLeft={() => {}}
      rightCollapsed={false}
      onToggleRight={() => {}}
      {...overrides}
    />,
  )
}

describe('TopBar', () => {
  it('renders the bar', () => {
    renderBar()
    expect(screen.getByTestId('studio-top-bar')).toBeInTheDocument()
  })

  it('draws the wordmark and the flow name', () => {
    renderBar({ dirty: false })
    expect(screen.getByTestId('studio-wordmark-square')).toBeInTheDocument()
    expect(screen.getByText('jobik')).toBeInTheDocument()
    expect(screen.getByText('publication')).toBeInTheDocument()
  })

  it('shows the flow name with its mono file badge and the long dirty label', () => {
    renderBar()
    expect(screen.getByTestId('studio-flow-file')).toHaveTextContent('flow.ts')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(screen.getByTestId('studio-dirty-dot')).toBeInTheDocument()
  })

  /**
   * Every artboard names a real file beside the flow — `2A` and `Studio — default` both draw
   * `publication  flow.ts`. None of them draws an empty badge, and the design's own answer for a
   * bar that carries no badge is `panels collapsed`, where the element is simply not there. So an
   * unknown file name is the absent case: the badge goes, and nothing stands in for it.
   */
  it('omits the file badge entirely when no file name is known', () => {
    render(
      <TopBar
        flowName="publication"
        dirty
        leftCollapsed={false}
        onToggleLeft={() => {}}
        rightCollapsed={false}
        onToggleRight={() => {}}
      />,
    )
    expect(screen.queryByTestId('studio-flow-file')).toBeNull()
    // The identity row is the flow name alone — no placeholder element in the badge's seat.
    expect(screen.getByTestId('studio-top-bar-identity').childElementCount).toBe(1)
    expect(screen.getByText('publication')).toBeInTheDocument()
  })

  it('shows the saved tone instead when the flow is clean', () => {
    renderBar({ dirty: false })
    expect(screen.queryByTestId('studio-dirty-dot')).not.toBeInTheDocument()
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
    // `2A` heads the bar `publication  flow.ts  • Saved`; both tones are fixed by the design.
    expect(screen.getByTestId('studio-saved-dot')).toBeInTheDocument()
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('shows no save state at all while a run is in progress', () => {
    renderBar({ running: true, runningChip: <div data-testid="running-chip" /> })
    expect(screen.queryByTestId('studio-dirty')).not.toBeInTheDocument()
    expect(screen.queryByTestId('studio-saved')).not.toBeInTheDocument()
  })

  it('seats the run control at the head of the actions without going compact', () => {
    renderBar({ dirty: false, runControl: <div data-testid="run-control" /> })
    // `2A`: the pill is in the bar with the dock open, so the file badge and `Saved` both stay.
    expect(screen.getByText('flow.ts')).toBeInTheDocument()
    expect(screen.getByText('Saved')).toBeInTheDocument()
    const control = screen.getByTestId('run-control')
    expect(screen.getByTestId('studio-top-bar-actions')).toContainElement(control)
  })

  it('stays out of the compact treatment when a panel collapses — only a streaming run goes compact', () => {
    renderBar({ leftCollapsed: true, rightCollapsed: true })
    expect(screen.getByText('flow.ts')).toBeInTheDocument()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(screen.queryByText('Unsaved')).not.toBeInTheDocument()
  })

  it('goes compact and renders whatever fills the running chip slot', () => {
    renderBar({ dirty: false, running: true, runningChip: <div data-testid="running-chip" /> })
    expect(screen.queryByText('flow.ts')).not.toBeInTheDocument()
    // The design seats the chip at the head of the right-hand cluster, not mid-bar.
    const chip = screen.getByTestId('running-chip')
    expect(screen.getByTestId('studio-top-bar-actions')).toContainElement(chip)
  })

  it('disables the actions while a run is in progress', async () => {
    const onSave = vi.fn()
    renderBar({ running: true, onSave })
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    await userEvent.click(save)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('fires onValidate and onSave when idle', async () => {
    const onValidate = vi.fn()
    const onSave = vi.fn()
    renderBar({ onValidate, onSave })
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onValidate).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  /** `3D` — the bar's Validate is the four-cell control now, and the bar carries its cell down. */
  describe('the 3D Validate control', () => {
    it('says Validate with no cell named', () => {
      renderBar()
      expect(screen.getByTestId('studio-validate')).toHaveTextContent('Validate')
    })

    it('carries the checking and valid cells through', () => {
      renderBar({ validate: { state: 'checking' } })
      expect(screen.getByTestId('studio-validate')).toHaveTextContent('Validating')

      cleanup()
      renderBar({ validate: { state: 'valid' } })
      expect(screen.getByTestId('studio-validate')).toHaveTextContent('Valid')
    })

    it('carries the count with the invalid cell and opens the report from it', async () => {
      const onOpenReport = vi.fn()
      renderBar({ validate: { state: 'invalid', errorCount: 1 }, onOpenReport })

      const control = screen.getByTestId('studio-validate')
      expect(control).toHaveTextContent('1 error')
      await userEvent.click(control)
      expect(onOpenReport).toHaveBeenCalledTimes(1)
    })

    it('still dims with the rest of the actions while a run is in flight', () => {
      renderBar({ running: true })
      expect(screen.getByTestId('studio-validate')).toBeDisabled()
    })
  })

  /**
   * The panel toggle buttons: permanent slots of the bar, one on each side of the identity row,
   * always present regardless of collapse state — see `PanelHeader`'s doc comment for why they
   * moved here from each panel's own header.
   */
  describe('the panel toggle buttons', () => {
    it('seats the left toggle between the divider and the flow identity', () => {
      renderBar()
      const left = screen.getByRole('button', { name: 'Collapse flows and nodes' })
      expect(left).toBeInTheDocument()
    })

    it('seats the right toggle at the end of the actions cluster', () => {
      renderBar()
      const right = screen.getByRole('button', { name: 'Collapse run panel' })
      expect(screen.getByTestId('studio-top-bar-actions')).toContainElement(right)
    })

    it('names each toggle by what it currently does, not by a fixed word', () => {
      renderBar({ leftCollapsed: true, rightCollapsed: true })
      expect(screen.getByRole('button', { name: 'Expand flows and nodes' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Expand run panel' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Collapse flows and nodes' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Collapse run panel' })).toBeNull()
    })

    it('fires onToggleLeft and onToggleRight independently', async () => {
      const onToggleLeft = vi.fn()
      const onToggleRight = vi.fn()
      renderBar({ onToggleLeft, onToggleRight })
      await userEvent.click(screen.getByRole('button', { name: 'Collapse flows and nodes' }))
      expect(onToggleLeft).toHaveBeenCalledTimes(1)
      expect(onToggleRight).not.toHaveBeenCalled()
      await userEvent.click(screen.getByRole('button', { name: 'Collapse run panel' }))
      expect(onToggleRight).toHaveBeenCalledTimes(1)
      expect(onToggleLeft).toHaveBeenCalledTimes(1)
    })

    it('stays present even while a run is in progress and the chip fills the actions', () => {
      renderBar({ running: true, runningChip: <div data-testid="running-chip" /> })
      expect(screen.getByRole('button', { name: 'Collapse flows and nodes' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Collapse run panel' })).toBeInTheDocument()
    })
  })
})
