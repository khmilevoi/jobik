import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { borders } from '../tokens.js'
import { OutputPreview } from './OutputPreview.js'

afterEach(cleanup)

/** The `Output viewer` artboard's Preview panel, design lines 896–950. */
function ArtboardPreview() {
  return (
    <OutputPreview
      primary={{
        label: 'cover.png',
        meta: ['1024×1024', 'png', '412 kb'],
        metaTrailing: 'sRGB',
      }}
      variants={[
        { label: 'og.png', caption: '1200×630 · 208 kb' },
        { label: 'thumb.png', caption: '320×320 · 34 kb' },
      ]}
      emptyVariants={1}
      typedValues={[
        { name: 'caption', value: 'Release 0.4 — field-level connections' },
        { name: 'url', value: 'cdn.jobik.dev/p/219/cover.png', tone: 'url' },
        { name: 'bytes', value: 654336 },
        { name: 'checksum', value: 'sha256:9f2c…d41a', tone: 'opaque' },
      ]}
    />
  )
}

describe('OutputPreview', () => {
  it('is an 18px-padded, 18px-gapped two-column body', () => {
    render(<ArtboardPreview />)
    expect(screen.getByTestId('output-preview')).toHaveStyle({
      padding: '18px',
      display: 'flex',
      gap: '18px',
    })
    expect(screen.getByTestId('output-preview-column')).toHaveStyle({ flex: '1', gap: '12px' })
  })

  it('counts the primary plus every configured variant in the badge', () => {
    render(<ArtboardPreview />)
    expect(screen.getByTestId('output-primary-badge')).toHaveTextContent('1 / 3')
  })

  it('reproduces the artboard panel', () => {
    render(<ArtboardPreview />)
    expect(screen.getByTestId('output-metadata-row')).toHaveTextContent('1024×1024·png·412 kb')
    expect(screen.getByTestId('output-metadata-trailing')).toHaveTextContent('sRGB')
    expect(screen.getAllByTestId('output-variant')).toHaveLength(2)
    expect(screen.getByTestId('output-variant-empty')).toHaveTextContent('no variant')
    expect(screen.getByTestId('output-preview-divider')).toHaveStyle({
      height: '1px',
      background: borders.inlineHairline,
    })
    expect(screen.getByText('Typed values')).toBeInTheDocument()
    expect(screen.getAllByTestId('output-typed-name')).toHaveLength(4)
  })

  it('drops the variant row, the divider and the grid when a flow has neither', () => {
    render(<OutputPreview primary={{ label: 'cover.png' }} />)
    expect(screen.getByTestId('output-primary-badge')).toHaveTextContent('1 / 1')
    expect(screen.queryByTestId('output-variant-row')).toBeNull()
    expect(screen.queryByTestId('output-preview-divider')).toBeNull()
    expect(screen.queryByTestId('output-typed-values')).toBeNull()
  })

  it('keeps the divider out when only one of the two blocks is present', () => {
    render(
      <OutputPreview
        primary={{ label: 'cover.png' }}
        typedValues={[{ name: 'caption', value: 'Release 0.4' }]}
      />,
    )
    expect(screen.getByTestId('output-typed-values')).toBeInTheDocument()
    expect(screen.queryByTestId('output-preview-divider')).toBeNull()
  })
})
