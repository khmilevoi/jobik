import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PanelHeader } from './PanelHeader.js'

afterEach(cleanup)

describe('PanelHeader', () => {
  it('renders its children and nothing else — the collapse control moved to TopBar', () => {
    render(
      <PanelHeader data-testid="header">
        <span>Flows &amp; nodes</span>
      </PanelHeader>,
    )
    const header = screen.getByTestId('header')
    expect(header).toHaveTextContent('Flows & nodes')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('merges a caller class onto its own header box', () => {
    render(
      <PanelHeader data-testid="header" className="extra">
        <span />
      </PanelHeader>,
    )
    expect(screen.getByTestId('header').className).toContain('extra')
  })
})
