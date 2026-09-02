import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DockedRunControl } from './DockedControls.js'

afterEach(cleanup)

describe('DockedRunControl', () => {
  it('prints the entry id inside an inert label and fires onRun from the accent chip alone', async () => {
    const onRun = vi.fn()
    render(<DockedRunControl entryNodeId="start1" onRun={onRun} />)

    expect(screen.getByTestId('studio-docked-run')).toBeInTheDocument()
    expect(screen.getByTestId('studio-run-control-label')).toHaveTextContent('Run start1')
    // The label is plain text now — expand/collapse moved to TopBar's own toggle button — so the
    // chip offers exactly one control, the accent Run button.
    expect(screen.getAllByRole('button')).toHaveLength(1)

    await userEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(onRun).toHaveBeenCalledTimes(1)
  })
})
