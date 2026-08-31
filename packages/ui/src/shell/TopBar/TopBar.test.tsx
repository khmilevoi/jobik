import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TopBar } from './TopBar.js'

afterEach(cleanup)

describe('TopBar', () => {
  it('renders the bar', () => {
    render(<TopBar flowName="publication" flowFile="flow.ts" dirty />)
    expect(screen.getByTestId('studio-top-bar')).toBeInTheDocument()
  })

  it('draws the wordmark and the flow name', () => {
    render(<TopBar flowName="publication" flowFile="flow.ts" dirty={false} />)
    expect(screen.getByTestId('studio-wordmark-square')).toBeInTheDocument()
    expect(screen.getByText('jobik')).toBeInTheDocument()
    expect(screen.getByText('publication')).toBeInTheDocument()
  })

  it('shows the flow name with its mono file badge and the long dirty label', () => {
    render(<TopBar flowName="publication" flowFile="flow.ts" dirty />)
    expect(screen.getByText('flow.ts')).toBeInTheDocument()
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    expect(screen.getByTestId('studio-dirty-dot')).toBeInTheDocument()
  })

  it('shows the saved tone instead when the flow is clean', () => {
    render(<TopBar flowName="publication" flowFile="flow.ts" dirty={false} />)
    expect(screen.queryByTestId('studio-dirty-dot')).not.toBeInTheDocument()
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
    // `2A` heads the bar `publication  flow.ts  • Saved`; both tones are fixed by the design.
    expect(screen.getByTestId('studio-saved-dot')).toBeInTheDocument()
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('shows no save state at all while a run is in progress', () => {
    render(
      <TopBar
        flowName="publication"
        flowFile="flow.ts"
        dirty
        running
        runningChip={<div data-testid="running-chip" />}
      />,
    )
    expect(screen.queryByTestId('studio-dirty')).not.toBeInTheDocument()
    expect(screen.queryByTestId('studio-saved')).not.toBeInTheDocument()
  })

  it('seats the run control at the head of the actions without going compact', () => {
    render(
      <TopBar
        flowName="publication"
        flowFile="flow.ts"
        dirty={false}
        runControl={<div data-testid="run-control" />}
      />,
    )
    // `2A`: the pill is in the bar with the dock open, so the file badge and `Saved` both stay.
    expect(screen.getByText('flow.ts')).toBeInTheDocument()
    expect(screen.getByText('Saved')).toBeInTheDocument()
    const control = screen.getByTestId('run-control')
    expect(screen.getByTestId('studio-top-bar-actions')).toContainElement(control)
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
    expect(screen.queryByText('flow.ts')).not.toBeInTheDocument()
    expect(screen.getByText('Unsaved')).toBeInTheDocument()
    expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
    expect(screen.getByTestId('docked-left')).toBeInTheDocument()
    expect(screen.getByTestId('docked-right')).toBeInTheDocument()
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
    expect(screen.queryByText('flow.ts')).not.toBeInTheDocument()
    // The design seats the chip at the head of the right-hand cluster, not mid-bar.
    const chip = screen.getByTestId('running-chip')
    expect(screen.getByTestId('studio-top-bar-actions')).toContainElement(chip)
  })

  it('disables the actions while a run is in progress', async () => {
    const onSave = vi.fn()
    render(<TopBar flowName="publication" flowFile="flow.ts" dirty running onSave={onSave} />)
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
    await userEvent.click(screen.getByRole('button', { name: 'Validate' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onValidate).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  /** `3D` — the bar's Validate is the four-cell control now, and the bar carries its cell down. */
  describe('the 3D Validate control', () => {
    it('says Validate with no cell named', () => {
      render(<TopBar flowName="publication" flowFile="flow.ts" dirty />)
      expect(screen.getByTestId('studio-validate')).toHaveTextContent('Validate')
    })

    it('carries the checking and valid cells through', () => {
      render(
        <TopBar flowName="publication" flowFile="flow.ts" dirty validate={{ state: 'checking' }} />,
      )
      expect(screen.getByTestId('studio-validate')).toHaveTextContent('Validating')

      cleanup()
      render(
        <TopBar flowName="publication" flowFile="flow.ts" dirty validate={{ state: 'valid' }} />,
      )
      expect(screen.getByTestId('studio-validate')).toHaveTextContent('Valid')
    })

    it('carries the count with the invalid cell and opens the report from it', async () => {
      const onOpenReport = vi.fn()
      render(
        <TopBar
          flowName="publication"
          flowFile="flow.ts"
          dirty
          validate={{ state: 'invalid', errorCount: 1 }}
          onOpenReport={onOpenReport}
        />,
      )

      const control = screen.getByTestId('studio-validate')
      expect(control).toHaveTextContent('1 error')
      await userEvent.click(control)
      expect(onOpenReport).toHaveBeenCalledTimes(1)
    })

    it('still dims with the rest of the actions while a run is in flight', () => {
      render(<TopBar flowName="publication" flowFile="flow.ts" dirty running />)
      expect(screen.getByTestId('studio-validate')).toBeDisabled()
    })
  })
})
