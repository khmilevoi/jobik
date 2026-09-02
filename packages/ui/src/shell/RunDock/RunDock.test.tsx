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

/**
 * `2A` heads the dock `● Completed` / `#221 · 2.4s`: the header carries the run's state,
 * not only its number. `Run panel — states` gives the failed form the same shape on a tinted bar.
 */
describe('RunDock — the run state', () => {
  it('keeps `Run <entry>` when the caller names no state at all', () => {
    render(<RunDock entryNodeId="start1" onCollapse={() => {}} runMeta="#219" />)
    expect(screen.getByTestId('studio-dock-header').textContent).toContain('start1')
    expect(screen.queryByTestId('studio-dock-status')).toBeNull()
  })

  /** `Run panel — states` (design 2009-2011): the ring, `Running`, and `#219` opposite. */
  it('heads a running run with the spinner and the word, not the entry point', () => {
    render(
      <RunDock entryNodeId="start1" onCollapse={() => {}} runStatus="running" runMeta="#219" />,
    )
    expect(screen.getByTestId('studio-dock-status').textContent).toBe('Running')
    expect(screen.getByTestId('studio-dock-status-spinner')).toBeInTheDocument()
    expect(screen.queryByTestId('studio-dock-status-dot')).toBeNull()
    expect(screen.getByTestId('studio-dock-run-meta').textContent).toBe('#219')
    expect(screen.getByTestId('studio-dock-header').textContent).not.toContain('start1')
  })

  /**
   * The header the whole of F1 is about: `2A:1191` draws it as a state word plus meta, and the
   * running card draws the same two slots. So the shape a run reaches at its end is the shape it
   * had all along — a word on the left, a meta on the right, and no chevron on either.
   */
  it('holds one shape across running → completed', () => {
    const { rerender } = render(
      <RunDock entryNodeId="start1" onCollapse={() => {}} runStatus="running" runMeta="#221" />,
    )
    const running = screen.getByTestId('studio-dock-header')
    expect(screen.getByTestId('studio-dock-status')).toBeInTheDocument()
    expect(screen.getByTestId('studio-dock-run-meta')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Collapse run panel' })).toBeNull()

    rerender(
      <RunDock
        entryNodeId="start1"
        onCollapse={() => {}}
        runStatus="completed"
        runMeta="#221 · 2.4s"
      />,
    )
    // The same header element, not a swapped-in one: the left slot changed its word, nothing else.
    expect(screen.getByTestId('studio-dock-header')).toBe(running)
    expect(screen.getByTestId('studio-dock-status').textContent).toBe('Completed')
    expect(screen.getByTestId('studio-dock-run-meta')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Collapse run panel' })).toBeNull()
  })

  it('heads a completed run with its state word and the run meta', () => {
    render(
      <RunDock
        entryNodeId="start1"
        onCollapse={() => {}}
        runStatus="completed"
        runMeta="#221 · 2.4s"
      />,
    )
    expect(screen.getByTestId('studio-dock-status').textContent).toBe('Completed')
    expect(screen.getByTestId('studio-dock-status-dot')).toBeInTheDocument()
    expect(screen.getByTestId('studio-dock-run-meta').textContent).toBe('#221 · 2.4s')
    expect(screen.getByTestId('studio-dock-header').textContent).not.toContain('start1')
  })

  it('heads a failed run `Run failed`', () => {
    render(
      <RunDock
        entryNodeId="start1"
        onCollapse={() => {}}
        runStatus="failed"
        runMeta="#220 · 0.8s"
        runMetaTone="failed"
      />,
    )
    expect(screen.getByTestId('studio-dock-status').textContent).toBe('Run failed')
    expect(screen.queryByRole('button', { name: 'Collapse run panel' })).toBeNull()
  })

  /**
   * R7 — the header the acceptance pass caught saying `Run failed` over a `RunCancelledError`.
   * No artboard draws this state; the word and the muted dot are `RunDockStatus`' recorded call.
   */
  it('heads a cancelled run `Run cancelled`, not `Run failed`', () => {
    render(
      <RunDock
        entryNodeId="start1"
        onCollapse={() => {}}
        runStatus="cancelled"
        runMeta="#4 · 0.5s"
      />,
    )
    expect(screen.getByTestId('studio-dock-status').textContent).toBe('Run cancelled')
    expect(screen.getByTestId('studio-dock-status-dot')).toBeInTheDocument()
  })

  it('drops the chevron for a state that arrived without a run number', () => {
    render(<RunDock entryNodeId="start1" onCollapse={() => {}} runStatus="completed" />)
    expect(screen.queryByTestId('studio-dock-run-meta')).toBeNull()
    expect(screen.getByTestId('studio-dock-status').textContent).toBe('Completed')
  })
})
