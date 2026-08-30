import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { accent, fontFamilies, textColors } from '../tokens.js'
import { resolveTypedValueTone, TypedValueGrid } from './TypedValueGrid.js'

afterEach(cleanup)

const artboardValues = [
  { name: 'caption', value: 'Release 0.4 — field-level connections' },
  { name: 'url', value: 'cdn.jobik.dev/p/219/cover.png', tone: 'url' },
  { name: 'bytes', value: 654336 },
  { name: 'checksum', value: 'sha256:9f2c…d41a', tone: 'opaque' },
] as const

describe('resolveTypedValueTone', () => {
  it('is number for a number and url for an absolute url', () => {
    expect(resolveTypedValueTone(654336)).toBe('number')
    expect(resolveTypedValueTone('https://cdn.jobik.dev/p/219/cover.png')).toBe('url')
  })

  it('is text for everything else, including a scheme-less host', () => {
    expect(resolveTypedValueTone('Release 0.4')).toBe('text')
    expect(resolveTypedValueTone('cdn.jobik.dev/p/219/cover.png')).toBe('text')
  })
})

describe('TypedValueGrid', () => {
  it('is a 110px / 1fr grid at 11.5px', () => {
    render(<TypedValueGrid values={artboardValues} />)
    expect(screen.getByTestId('output-typed-values')).toHaveStyle({
      display: 'grid',
      gridTemplateColumns: '110px 1fr',
      gap: '8px 14px',
      fontSize: '11.5px',
    })
  })

  it('prints every name in muted mono', () => {
    render(<TypedValueGrid values={artboardValues} />)
    const names = screen.getAllByTestId('output-typed-name')
    expect(names.map((node) => node.textContent)).toEqual(['caption', 'url', 'bytes', 'checksum'])
    expect(names[0]).toHaveStyle({ fontFamily: fontFamilies.mono, color: textColors.muted })
  })

  it('paints each of the four artboard tones', () => {
    render(<TypedValueGrid values={artboardValues} />)
    const values = screen.getAllByTestId('output-typed-value')
    expect(values[0]).toHaveStyle({ color: textColors.activeFieldLabel })
    expect(values[0].style.fontFamily).toBe('')
    expect(values[1]).toHaveStyle({ fontFamily: fontFamilies.mono, color: accent.cssVar })
    expect(values[2]).toHaveStyle({
      fontFamily: fontFamilies.mono,
      color: textColors.activeFieldLabel,
    })
    expect(values[3]).toHaveStyle({
      fontFamily: fontFamilies.mono,
      color: textColors.inactiveListItem,
    })
  })

  it('groups a numeric value the way the artboard does', () => {
    render(<TypedValueGrid values={artboardValues} />)
    expect(screen.getAllByTestId('output-typed-value')[2]).toHaveTextContent('654 336')
  })

  it('honours an explicit tone over the derived one', () => {
    render(<TypedValueGrid values={[{ name: 'id', value: 'a1b2', tone: 'opaque' }]} />)
    expect(screen.getByTestId('output-typed-value')).toHaveStyle({
      color: textColors.inactiveListItem,
    })
  })
})
