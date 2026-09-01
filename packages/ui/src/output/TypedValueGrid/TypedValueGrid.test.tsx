import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
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

  it('is url for the artboard’s scheme-less host and path', () => {
    expect(resolveTypedValueTone('cdn.jobik.dev/p/219/cover.png')).toBe('url')
  })

  it('is opaque for a scheme no browser follows', () => {
    expect(resolveTypedValueTone('sha256:9f2c…d41a')).toBe('opaque')
    expect(resolveTypedValueTone('urn:isbn:0451450523')).toBe('opaque')
  })

  it('is text for everything else, including a dotted identifier and a duration', () => {
    expect(resolveTypedValueTone('Release 0.4')).toBe('text')
    expect(resolveTypedValueTone('render.image')).toBe('text')
    expect(resolveTypedValueTone('2.4s')).toBe('text')
    expect(resolveTypedValueTone('cdn.jobik.dev')).toBe('text')
  })
})

describe('TypedValueGrid', () => {
  it('prints every name in order', () => {
    render(<TypedValueGrid values={artboardValues} />)
    const names = screen.getAllByTestId('output-typed-name')
    expect(names.map((node) => node.textContent)).toEqual(['caption', 'url', 'bytes', 'checksum'])
  })

  it('groups a numeric value the way the artboard does', () => {
    render(<TypedValueGrid values={artboardValues} />)
    expect(screen.getAllByTestId('output-typed-value')[2]).toHaveTextContent('654 336')
  })
})
