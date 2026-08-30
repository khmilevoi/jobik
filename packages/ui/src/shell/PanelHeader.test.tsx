import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PanelHeader } from './PanelHeader.js'

afterEach(cleanup)

describe('PanelHeader', () => {
  it('draws the 38px header with its divider', () => {
    render(
      <PanelHeader
        data-testid="header"
        chevron="left"
        collapseLabel="Collapse flows and nodes"
        onCollapse={() => {}}
      >
        <span>Flows &amp; nodes</span>
      </PanelHeader>,
    )
    const header = screen.getByTestId('header')
    expect(header.style.height).toBe('38px')
    expect(header.style.flex).toBe('0 0 auto')
    expect(header.style.justifyContent).toBe('space-between')
    expect(header.style.padding).toBe('0px 10px 0px 14px')
    expect(header.style.borderBottom).toBe('1px solid rgb(20, 22, 24)')
  })

  it('draws the 22px chevron button and fires onCollapse', async () => {
    const onCollapse = vi.fn()
    render(
      <PanelHeader chevron="left" collapseLabel="Collapse flows and nodes" onCollapse={onCollapse}>
        <span>Flows &amp; nodes</span>
      </PanelHeader>,
    )
    const button = screen.getByRole('button', { name: 'Collapse flows and nodes' })
    expect(button.style.width).toBe('22px')
    expect(button.style.height).toBe('22px')
    expect(button.style.border).toBe('1px solid rgb(33, 36, 39)')
    expect(button.style.borderRadius).toBe('4px')
    await userEvent.click(button)
    expect(onCollapse).toHaveBeenCalledTimes(1)
  })

  it('points the chevron away from the canvas on each side', () => {
    const { rerender, container } = render(
      <PanelHeader chevron="left" collapseLabel="Collapse" onCollapse={() => {}}>
        <span />
      </PanelHeader>,
    )
    expect(container.querySelector('path')).toHaveAttribute('d', 'M5.5 1 2 4.5 5.5 8')

    rerender(
      <PanelHeader chevron="right" collapseLabel="Collapse" onCollapse={() => {}}>
        <span />
      </PanelHeader>,
    )
    expect(container.querySelector('path')).toHaveAttribute('d', 'M3.5 1 7 4.5 3.5 8')
  })
})
