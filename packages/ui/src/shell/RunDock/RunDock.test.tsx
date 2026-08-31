import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RunDock } from './RunDock.js'

afterEach(cleanup)

describe('RunDock', () => {
  it('draws the dock', () => {
    render(
      <RunDock entryNodeId="start1" onCollapse={() => {}}>
        <div data-testid="dock-content" />
      </RunDock>,
    )
    expect(screen.getByTestId('studio-dock')).toBeInTheDocument()
  })

  it('heads the dock with Run and the entry id', () => {
    render(<RunDock entryNodeId="start1" onCollapse={() => {}} />)
    expect(screen.getByText('Run')).toBeInTheDocument()
    expect(screen.getByText('start1')).toBeInTheDocument()
  })

  it('collapses to the right', async () => {
    const onCollapse = vi.fn()
    const { container } = render(<RunDock entryNodeId="start1" onCollapse={onCollapse} />)
    expect(container.querySelector('path')).toHaveAttribute('d', 'M3.5 1 7 4.5 3.5 8')
    await userEvent.click(screen.getByRole('button', { name: 'Collapse run panel' }))
    expect(onCollapse).toHaveBeenCalledTimes(1)
  })

  it('gives the body what P11 builds inside it', () => {
    render(
      <RunDock entryNodeId="start1" onCollapse={() => {}}>
        <div data-testid="dock-content" />
      </RunDock>,
    )
    expect(screen.getByTestId('dock-content')).toBeInTheDocument()
  })

  it('builds nothing of its own inside the body', () => {
    render(<RunDock entryNodeId="start1" onCollapse={() => {}} />)
    expect(screen.getByTestId('studio-dock-body').childElementCount).toBe(0)
  })
})

/**
 * Closeout finding 8-A. `Studio — run in progress` (design 586–593) draws the dock header with the
 * run number where the idle chevron was; the standalone settled cards (801, 838) add the elapsed
 * after it.
 */
describe('RunDock — the run number', () => {
  it('keeps the chevron while idle', () => {
    render(<RunDock entryNodeId="start1" onCollapse={() => {}} />)
    expect(screen.getByRole('button', { name: 'Collapse run panel' })).toBeInTheDocument()
    expect(screen.queryByTestId('studio-dock-run-meta')).toBeNull()
  })

  it('replaces the chevron with the run number during a run', () => {
    render(<RunDock entryNodeId="start1" onCollapse={() => {}} runMeta="#219" />)
    const header = screen.getByTestId('studio-dock-header')
    expect(header.textContent).toContain('start1')
    expect(screen.queryByRole('button', { name: 'Collapse run panel' })).toBeNull()
    expect(screen.getByTestId('studio-dock-run-meta').textContent).toBe('#219')
  })

  it('renders a failed run’s own meta text too', () => {
    render(
      <RunDock
        entryNodeId="start1"
        onCollapse={() => {}}
        runMeta="#220 · 0.8s"
        runMetaTone="failed"
      />,
    )
    expect(screen.getByTestId('studio-dock-run-meta').textContent).toBe('#220 · 0.8s')
  })

  it('still builds nothing of its own inside the body while a run is in flight', () => {
    render(<RunDock entryNodeId="start1" onCollapse={() => {}} runMeta="#219" />)
    expect(screen.getByTestId('studio-dock-body').childElementCount).toBe(0)
  })
})
