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
    expect(screen.getByTestId('running-chip')).toBeInTheDocument()
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
})
