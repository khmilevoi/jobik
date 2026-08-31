import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RunDock } from './RunDock.js'

afterEach(cleanup)

describe('RunDock', () => {
  it('draws the 320px dock', () => {
    render(
      <RunDock entryNodeId="start1" onCollapse={() => {}}>
        <div data-testid="dock-content" />
      </RunDock>,
    )
    const dock = screen.getByTestId('studio-dock')
    expect(dock.style.width).toBe('320px')
    expect(dock.style.flex).toBe('0 0 auto')
    expect(dock.style.background).toBe('rgb(10, 11, 13)')
    expect(dock.style.borderLeft).toBe('1px solid rgb(23, 25, 28)')
    expect(dock.style.flexDirection).toBe('column')
  })

  it('heads the dock with Run and the entry id in accent mono', () => {
    render(<RunDock entryNodeId="start1" onCollapse={() => {}} />)
    const run = screen.getByText('Run')
    expect(run.style.fontSize).toBe('12.5px')
    expect(run.style.fontWeight).toBe('600')
    expect(run.style.color).toBe('rgb(232, 234, 236)')
    const entry = screen.getByText('start1')
    expect(entry.style.fontSize).toBe('11.5px')
    expect(entry.style.fontFamily).toContain('JetBrains Mono')
    expect(entry.getAttribute('style')).toContain('var(--accent, #1fd6bd)')
  })

  it('collapses to the right', async () => {
    const onCollapse = vi.fn()
    const { container } = render(<RunDock entryNodeId="start1" onCollapse={onCollapse} />)
    expect(container.querySelector('path')).toHaveAttribute('d', 'M3.5 1 7 4.5 3.5 8')
    await userEvent.click(screen.getByRole('button', { name: 'Collapse run panel' }))
    expect(onCollapse).toHaveBeenCalledTimes(1)
  })

  it('gives the body the padding and gap P11 builds inside, and scrolls it', () => {
    render(
      <RunDock entryNodeId="start1" onCollapse={() => {}}>
        <div data-testid="dock-content" />
      </RunDock>,
    )
    const body = screen.getByTestId('studio-dock-body')
    expect(body.style.padding).toBe('16px 14px')
    expect(body.style.flexDirection).toBe('column')
    expect(body.style.gap).toBe('16px')
    expect(body.style.flex).toBe('1 1 0%')
    expect(body.style.minHeight).toBe('0px')
    expect(body.style.overflowY).toBe('auto')
    expect(screen.getByTestId('dock-content')).toBeInTheDocument()
  })

  it('builds nothing of its own inside the body', () => {
    render(<RunDock entryNodeId="start1" onCollapse={() => {}} />)
    expect(screen.getByTestId('studio-dock-body').childElementCount).toBe(0)
  })
})

/**
 * Closeout finding 8-A. `Studio — run in progress` (design 586–593) draws the dock header with the
 * run number where the idle chevron was and symmetric `0 14px` padding; the standalone settled
 * cards (801, 838) add the elapsed after it.
 */
describe('RunDock — the run number', () => {
  it('keeps the chevron and the asymmetric padding while idle', () => {
    render(<RunDock entryNodeId="start1" onCollapse={() => {}} />)
    expect(screen.getByTestId('studio-dock-header').style.padding).toBe('0px 10px 0px 14px')
    expect(screen.getByRole('button', { name: 'Collapse run panel' })).toBeInTheDocument()
    expect(screen.queryByTestId('studio-dock-run-meta')).toBeNull()
  })

  it('replaces the chevron with the run number during a run', () => {
    render(<RunDock entryNodeId="start1" onCollapse={() => {}} runMeta="#219" />)
    const header = screen.getByTestId('studio-dock-header')
    expect(header.style.padding).toBe('0px 14px')
    expect(header.textContent).toContain('start1')
    expect(screen.queryByRole('button', { name: 'Collapse run panel' })).toBeNull()
    const meta = screen.getByTestId('studio-dock-run-meta')
    expect(meta.textContent).toBe('#219')
    expect(meta.style.fontSize).toBe('10px')
    expect(meta.style.fontFamily).toContain('JetBrains Mono')
    expect(meta.style.color).toBe('rgb(93, 101, 108)')
  })

  it('paints a failed run’s meta in the failed card’s own colour', () => {
    render(
      <RunDock
        entryNodeId="start1"
        onCollapse={() => {}}
        runMeta="#220 · 0.8s"
        runMetaTone="failed"
      />,
    )
    const meta = screen.getByTestId('studio-dock-run-meta')
    expect(meta.textContent).toBe('#220 · 0.8s')
    expect(meta.style.color).toBe('rgb(109, 95, 92)')
  })

  it('still builds nothing of its own inside the body while a run is in flight', () => {
    render(<RunDock entryNodeId="start1" onCollapse={() => {}} runMeta="#219" />)
    expect(screen.getByTestId('studio-dock-body').childElementCount).toBe(0)
  })
})
