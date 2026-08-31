import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PanelHeader } from './PanelHeader.js'

afterEach(cleanup)

describe('PanelHeader', () => {
  it('renders its children and a labelled collapse button, and fires onCollapse', async () => {
    const onCollapse = vi.fn()
    render(
      <PanelHeader
        data-testid="header"
        chevron="left"
        collapseLabel="Collapse flows and nodes"
        onCollapse={onCollapse}
      >
        <span>Flows &amp; nodes</span>
      </PanelHeader>,
    )
    expect(screen.getByTestId('header')).toHaveTextContent('Flows & nodes')
    const button = screen.getByRole('button', { name: 'Collapse flows and nodes' })
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
