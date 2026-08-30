import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { borders, radii, surfaces, textColors } from '../tokens.js'
import { outputColors } from './outputTokens.js'
import { VariantRow } from './VariantRow.js'

afterEach(cleanup)

const artboardVariants = [
  { label: 'og.png', caption: '1200×630 · 208 kb' },
  { label: 'thumb.png', caption: '320×320 · 34 kb' },
]

describe('VariantRow', () => {
  it('lays the tiles out in equal 12px-gapped columns', () => {
    render(<VariantRow variants={artboardVariants} />)
    expect(screen.getByTestId('output-variant-row')).toHaveStyle({ display: 'flex', gap: '12px' })
    expect(screen.getAllByTestId('output-variant')).toHaveLength(2)
    expect(screen.getAllByTestId('output-variant')[0]).toHaveStyle({ flex: '1', gap: '7px' })
  })

  it('captions each tile in the type-annotation step', () => {
    render(<VariantRow variants={artboardVariants} />)
    const captions = screen.getAllByTestId('output-variant-caption')
    expect(captions[0]).toHaveTextContent('1200×630 · 208 kb')
    expect(captions[0]).toHaveStyle({ fontSize: '9.5px', color: textColors.typeAnnotation })
    expect(captions[1]).toHaveTextContent('320×320 · 34 kb')
  })

  it('renders the dashed no-variant tile after the configured ones', () => {
    render(<VariantRow variants={artboardVariants} emptyVariants={1} />)
    const empty = screen.getByTestId('output-variant-empty')
    expect(empty).toHaveStyle({
      height: '112px',
      border: `1px dashed ${borders.dashed}`,
      borderRadius: `${radii.control}px`,
      background: surfaces.topBar,
    })
    expect(empty).toHaveTextContent('no variant')
    expect(empty).toHaveTextContent('configured')
    expect(screen.getByTestId('output-variant-empty-label')).toHaveStyle({
      fontSize: '9.5px',
      color: outputColors.emptyVariantLabel,
    })
    expect(screen.getByTestId('output-variant-empty-caption')).toHaveStyle({
      color: textColors.faintest,
    })
    expect(screen.getByTestId('output-variant-empty-caption')).toHaveTextContent('optional')
  })

  it('renders no empty tiles by default', () => {
    render(<VariantRow variants={artboardVariants} />)
    expect(screen.queryByTestId('output-variant-empty')).toBeNull()
  })

  it('renders only empty tiles when a flow configured no variants', () => {
    render(<VariantRow variants={[]} emptyVariants={1} />)
    expect(screen.queryAllByTestId('output-variant')).toHaveLength(0)
    expect(screen.getAllByTestId('output-variant-empty')).toHaveLength(1)
  })

  it('omits the caption line for a variant that has none', () => {
    render(<VariantRow variants={[{ label: 'og.png' }]} />)
    expect(screen.getAllByTestId('output-variant')).toHaveLength(1)
    expect(screen.queryByTestId('output-variant-caption')).toBeNull()
  })
})
