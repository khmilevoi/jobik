import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { accent, fontFamilies, statusColors, textColors } from '../tokens.js'
import { RawJson } from './RawJson.js'

afterEach(cleanup)

const artboardReport = {
  run: 219,
  status: 'completed',
  ms: 2412,
  image: { type: 'Buffer', bytes: 654336, mime: 'image/png' },
  caption: 'Release 0.4 — field…',
  skipped: [],
}

describe('RawJson', () => {
  it('is a 16px-padded mono block at 10.5px', () => {
    render(<RawJson value={artboardReport} data-testid="raw" />)
    expect(screen.getByTestId('raw')).toHaveStyle({
      padding: '16px',
      fontFamily: fontFamilies.mono,
      fontSize: '10.5px',
      lineHeight: '1.75',
      color: textColors.inactiveListItem,
    })
  })

  it('numbers every line in the section-label step', () => {
    render(<RawJson value={artboardReport} data-testid="raw" />)
    const gutters = screen.getAllByTestId('raw-json-gutter')
    expect(gutters).toHaveLength(12)
    expect(gutters[0]).toHaveTextContent('1')
    expect(gutters[11]).toHaveTextContent('12')
    expect(gutters[0]).toHaveStyle({ color: textColors.sectionLabel })
  })

  it('indents with real spaces the browser keeps', () => {
    render(<RawJson value={artboardReport} data-testid="raw" />)
    const lines = screen.getAllByTestId('raw-json-line')
    expect(lines[1]).toHaveStyle({ whiteSpace: 'pre' })
    expect(lines[1].textContent).toBe('2   "run": 219,')
  })

  it('paints strings accent, scalars bright and a completed status green', () => {
    render(<RawJson value={artboardReport} data-testid="raw" />)
    expect(screen.getByText('"image/png"')).toHaveStyle({ color: accent.cssVar })
    expect(screen.getByText('654336')).toHaveStyle({ color: textColors.activeFieldLabel })
    expect(screen.getByText('"completed"')).toHaveStyle({ color: statusColors.ok })
  })
})
