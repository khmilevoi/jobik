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
