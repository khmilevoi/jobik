import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { OutputMetadataRow, PrimaryImage } from './PrimaryImage.js'

afterEach(cleanup)

describe('OutputMetadataRow', () => {
  it('prints the parts with a separator between them', () => {
    render(<OutputMetadataRow parts={['1024×1024', 'png', '412 kb']} trailing="sRGB" />)
    const row = screen.getByTestId('output-metadata-row')
    expect(row).toHaveTextContent('1024×1024·png·412 kb')
    expect(screen.getAllByTestId('output-metadata-separator')).toHaveLength(2)
  })

  it('omits the trailing item when there is none', () => {
    render(<OutputMetadataRow parts={['1200×630', '208 kb']} />)
    expect(screen.queryByTestId('output-metadata-trailing')).toBeNull()
  })
})

describe('PrimaryImage', () => {
  it('paints the n / m badge over the top left of the frame', () => {
    render(<PrimaryImage label="cover.png" index={1} total={3} />)
    expect(screen.getByTestId('output-primary-badge')).toHaveTextContent('1 / 3')
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
