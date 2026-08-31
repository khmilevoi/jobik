import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SectionLabel } from './SectionLabel.js'

afterEach(cleanup)

describe('SectionLabel', () => {
  it('renders its children', () => {
    render(<SectionLabel data-testid="label">Flows</SectionLabel>)
    expect(screen.getByTestId('label')).toHaveTextContent('Flows')
  })

  /**
   * The prop contract, not the appearance: `color` is a value the stylesheet cannot know, and the
   * custom property is the only place it lands. The rule's own default is never asserted.
   */
  it('passes a colour override through as the custom property the rule reads', () => {
    render(
      <SectionLabel data-testid="label" color="#5b6167">
        Flows &amp; nodes
      </SectionLabel>,
    )
    expect(screen.getByTestId('label').style.getPropertyValue('--jbk-section-label-color')).toBe(
      '#5b6167',
    )
  })
})
