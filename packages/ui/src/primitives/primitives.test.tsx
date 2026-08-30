import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Badge } from './Badge.js'
import { Chip, chipStyle } from './Chip.js'
import { InsetWell } from './InsetWell.js'
import { SectionLabel } from './SectionLabel.js'
import { TypeAnnotation } from './TypeAnnotation.js'

afterEach(cleanup)

describe('Chip', () => {
  it('draws the neutral 28px chip', () => {
    render(<Chip data-testid="chip">Flows &amp; nodes</Chip>)
    const chip = screen.getByTestId('chip')
    expect(chip.style.height).toBe('28px')
    expect(chip.style.padding).toBe('0px 10px')
    expect(chip.style.border).toBe('1px solid rgb(33, 37, 40)')
    expect(chip.style.borderRadius).toBe('5px')
    expect(chip.style.background).toBe('rgb(14, 16, 18)')
    expect(chip.style.gap).toBe('8px')
  })

  it('draws the accent-tinted chip and honours gap and trailing padding', () => {
    render(
      <Chip data-testid="chip" tone="accent" gap={9} trailing={<span>Cancel</span>}>
        Running
      </Chip>,
    )
    const chip = screen.getByTestId('chip')
    expect(chip.style.gap).toBe('9px')
    expect(chip.style.padding).toBe('0px 4px 0px 10px')
    expect(chip.getAttribute('style')).toContain('rgba(31, 214, 189, 0.3)')
    expect(chip.getAttribute('style')).toContain('rgba(31, 214, 189, 0.06)')
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('exposes the same box through chipStyle for the one caller that must be a button', () => {
    expect(chipStyle({ gap: 7 })).toMatchObject({
      height: '28px',
      padding: '0 10px',
      borderRadius: '5px',
      gap: '7px',
    })
  })
})

describe('Badge', () => {
  it('draws the mono file badge', () => {
    render(<Badge data-testid="badge">flow.ts</Badge>)
    const badge = screen.getByTestId('badge')
    expect(badge.style.fontSize).toBe('10px')
    expect(badge.style.color).toBe('rgb(92, 100, 107)')
    expect(badge.style.border).toBe('1px solid rgb(30, 33, 36)')
    expect(badge.style.borderRadius).toBe('3px')
    expect(badge.style.padding).toBe('2px 5px')
    expect(badge.style.fontFamily).toContain('JetBrains Mono')
  })
})

describe('SectionLabel', () => {
  it('draws the uppercase mono 9.5px label', () => {
    render(<SectionLabel data-testid="label">Flows</SectionLabel>)
    const label = screen.getByTestId('label')
    expect(label.style.fontSize).toBe('9.5px')
    expect(label.style.letterSpacing).toBe('0.1em')
    expect(label.style.textTransform).toBe('uppercase')
    expect(label.style.color).toBe('rgb(78, 85, 91)')
  })

  it('accepts a colour override and merges an extra style last', () => {
    render(
      <SectionLabel data-testid="label" color="#5b6167" style={{ padding: '14px 10px 6px 14px' }}>
        Flows &amp; nodes
      </SectionLabel>,
    )
    const label = screen.getByTestId('label')
    expect(label.style.color).toBe('rgb(91, 97, 103)')
    expect(label.style.padding).toBe('14px 10px 6px 14px')
    expect(label.style.fontSize).toBe('9.5px')
  })
})

describe('InsetWell', () => {
  it('draws the control well by default', () => {
    render(<InsetWell data-testid="well">Typed flows, quietly</InsetWell>)
    const well = screen.getByTestId('well')
    expect(well.style.border).toBe('1px solid rgb(33, 37, 40)')
    expect(well.style.background).toBe('rgb(12, 14, 16)')
    expect(well.style.padding).toBe('9px 10px')
    expect(well.style.borderRadius).toBe('5px')
  })

  it('draws the output well', () => {
    render(
      <InsetWell data-testid="well" variant="output">
        output
      </InsetWell>,
    )
    const well = screen.getByTestId('well')
    expect(well.style.border).toBe('1px solid rgb(30, 33, 36)')
    expect(well.style.background).toBe('rgb(10, 11, 12)')
    expect(well.style.padding).toBe('8px')
  })
})

describe('TypeAnnotation', () => {
  it('draws the mono 10px annotation', () => {
    render(<TypeAnnotation data-testid="type">string</TypeAnnotation>)
    const type = screen.getByTestId('type')
    expect(type.style.fontSize).toBe('10px')
    expect(type.style.color).toBe('rgb(93, 101, 108)')
    expect(type.style.fontFamily).toContain('JetBrains Mono')
  })
})
