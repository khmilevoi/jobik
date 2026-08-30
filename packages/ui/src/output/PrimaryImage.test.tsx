import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { canvasColors } from '../canvas/canvasTokens.js'
import { radii, textColors } from '../tokens.js'
import { outputColors } from './outputTokens.js'
import { OutputMetadataRow, PrimaryImage } from './PrimaryImage.js'

afterEach(cleanup)

describe('OutputMetadataRow', () => {
  it('prints the parts in mono with dimmer separators between them', () => {
    render(<OutputMetadataRow parts={['1024×1024', 'png', '412 kb']} trailing="sRGB" />)
    const row = screen.getByTestId('output-metadata-row')
    expect(row).toHaveStyle({ gap: '9px', fontSize: '10px', color: canvasColors.metadata })
    expect(row).toHaveTextContent('1024×1024·png·412 kb')
    const separators = screen.getAllByTestId('output-metadata-separator')
    expect(separators).toHaveLength(2)
    expect(separators[0]).toHaveStyle({ color: canvasColors.metadataSeparator })
  })

  it('right-aligns the trailing item in the section-label step', () => {
    render(<OutputMetadataRow parts={['1024×1024']} trailing="sRGB" />)
    expect(screen.getByTestId('output-metadata-trailing')).toHaveStyle({
      color: textColors.sectionLabel,
    })
  })

  it('omits the trailing item when there is none', () => {
    render(<OutputMetadataRow parts={['1200×630', '208 kb']} />)
    expect(screen.queryByTestId('output-metadata-trailing')).toBeNull()
  })
})

describe('PrimaryImage', () => {
  it('is the artboard 336px column with an 8px gap', () => {
    render(<PrimaryImage label="cover.png" index={1} total={3} />)
    expect(screen.getByTestId('output-primary')).toHaveStyle({
      width: '336px',
      flex: 'none',
      gap: '8px',
    })
  })

  it('paints the n / m badge over the top left of the frame', () => {
    render(<PrimaryImage label="cover.png" index={1} total={3} />)
    const badge = screen.getByTestId('output-primary-badge')
    expect(badge).toHaveTextContent('1 / 3')
    expect(badge).toHaveStyle({
      position: 'absolute',
      left: '8px',
      top: '8px',
      height: '18px',
      borderRadius: `${radii.badge}px`,
      background: outputColors.badgeScrim,
      fontSize: '9.5px',
      color: textColors.fieldLabel,
    })
  })

  it('renders the metadata row it is given and nothing when it is given none', () => {
    const { rerender } = render(
      <PrimaryImage
        label="cover.png"
        index={1}
        total={3}
        meta={['1024×1024', 'png', '412 kb']}
        metaTrailing="sRGB"
      />,
    )
    expect(screen.getByTestId('output-metadata-row')).toHaveTextContent('1024×1024·png·412 kb')
    expect(screen.getByTestId('output-metadata-trailing')).toHaveTextContent('sRGB')
    rerender(<PrimaryImage label="cover.png" index={1} total={3} />)
    expect(screen.queryByTestId('output-metadata-row')).toBeNull()
  })

  it('passes the url through to the frame', () => {
    render(<PrimaryImage label="cover.png" src="/assets/a1" index={1} total={1} />)
    expect(screen.getByAltText('cover.png')).toHaveAttribute('src', '/assets/a1')
  })
})
