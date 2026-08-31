import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { motion } from '../tokens.js'
import { RunningChip, SaveConflictChip } from './RunningChip.js'

afterEach(cleanup)

describe('RunningChip', () => {
  it('reads Running, the start id and the elapsed time', () => {
    render(<RunningChip startId="start1" elapsed="1.3s" />)

    expect(screen.getByTestId('studio-running-chip').textContent).toContain('Running')
    expect(screen.getByTestId('studio-running-start').textContent).toBe('start1')
    expect(screen.getByTestId('studio-running-elapsed').textContent).toBe('1.3s')
  })

  it('spins on the .7s loop the design fixes', () => {
    render(<RunningChip startId="start1" elapsed="0.0s" />)

    expect(screen.getByTestId('studio-running-spinner')).toHaveStyle({
      animation: motion.spinner,
    })
  })

  it('cancels from the chip', async () => {
    const onCancel = vi.fn()
    render(<RunningChip startId="start1" elapsed="1.3s" onCancel={onCancel} />)

    await userEvent.click(screen.getByTestId('studio-running-cancel'))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('SaveConflictChip', () => {
  it('offers reload and copy-draft, and never a save-anyway', () => {
    render(<SaveConflictChip />)

    expect(screen.getByTestId('studio-conflict-chip').textContent).toContain('changed on disk')
    expect(screen.getByTestId('studio-conflict-reload')).toBeInTheDocument()
    expect(screen.getByTestId('studio-conflict-copy')).toBeInTheDocument()
    expect(screen.queryByText(/overwrite/i)).toBeNull()
  })

  it('calls each action', async () => {
    const onReload = vi.fn()
    const onCopyDraft = vi.fn()
    render(<SaveConflictChip onReload={onReload} onCopyDraft={onCopyDraft} />)

    await userEvent.click(screen.getByTestId('studio-conflict-reload'))
    await userEvent.click(screen.getByTestId('studio-conflict-copy'))

    expect(onReload).toHaveBeenCalledTimes(1)
    expect(onCopyDraft).toHaveBeenCalledTimes(1)
  })
})
