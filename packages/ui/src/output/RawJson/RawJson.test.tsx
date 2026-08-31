import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
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
  it('numbers every line', () => {
    render(<RawJson value={artboardReport} data-testid="raw" />)
    const gutters = screen.getAllByTestId('raw-json-gutter')
    expect(gutters).toHaveLength(12)
    expect(gutters[0]).toHaveTextContent('1')
    expect(gutters[11]).toHaveTextContent('12')
  })

  it('indents with real spaces the browser keeps', () => {
    render(<RawJson value={artboardReport} data-testid="raw" />)
    const lines = screen.getAllByTestId('raw-json-line')
    expect(lines[1].textContent).toBe('2   "run": 219,')
  })
})
