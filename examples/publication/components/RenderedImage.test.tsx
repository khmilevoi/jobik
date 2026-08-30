import type { OutputComponentProps } from '@jobik/ui'
import { canvasColors, canvasMetrics, NodeOutputSlot } from '@jobik/ui'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PUBLICATION_ASSET_NAME } from '../types.js'
import { RenderedImage } from './RenderedImage.js'

afterEach(cleanup)

const image = { type: 'Buffer', mime: 'image/png', bytes: 421888, id: 'a1' } as const

const props: OutputComponentProps = {
  nodeId: 'render',
  output: { image, caption: 'Release 0.4 — field-level connections' },
  surface: 'viewer',
  assetUrl: () => '/assets/a1',
}

describe('RenderedImage at the viewer surface', () => {
  it('renders the design metadata row from the example`s own constants', () => {
    render(<RenderedImage {...props} />)
    expect(screen.getByTestId('output-metadata-row')).toHaveTextContent('1024×1024·png·412 kb')
    expect(screen.getByTestId('output-metadata-trailing')).toHaveTextContent('sRGB')
  })

  it('counts one image, because imageOut emits one', () => {
    render(<RenderedImage {...props} />)
    expect(screen.getByTestId('output-primary-badge')).toHaveTextContent('1 / 1')
    expect(screen.queryAllByTestId('output-variant')).toHaveLength(0)
    expect(screen.getByTestId('output-variant-empty')).toHaveTextContent('no variant')
  })

  it('lists the two typed values the node actually produces', () => {
    render(<RenderedImage {...props} />)
    expect(screen.getAllByTestId('output-typed-name').map((n) => n.textContent)).toEqual([
      'caption',
      'bytes',
    ])
    const values = screen.getAllByTestId('output-typed-value')
    expect(values[0]).toHaveTextContent('Release 0.4 — field-level connections')
    expect(values[1]).toHaveTextContent('421 888')
  })

  it('shows the resolved asset and falls back to the placeholder without one', () => {
    const { rerender } = render(<RenderedImage {...props} />)
    expect(screen.getByAltText(PUBLICATION_ASSET_NAME)).toHaveAttribute('src', '/assets/a1')
    rerender(<RenderedImage {...props} assetUrl={() => undefined} />)
    expect(screen.getByTestId('image-frame-label')).toHaveTextContent(PUBLICATION_ASSET_NAME)
  })
})

describe('RenderedImage at the card surface', () => {
  it('fills the 140px inline slot with the image alone', () => {
    render(
      <NodeOutputSlot
        slot={{ content: <RenderedImage {...props} surface="card" /> }}
        captionColor={canvasColors.metadata}
      />,
    )
    const media = screen.getByTestId('node-output-media')
    expect(media).toHaveStyle({ height: `${canvasMetrics.outputSlotMediaHeight}px` })
    expect(media).not.toHaveTextContent('image output')
    const rendered = screen.getByAltText('Release 0.4 — field-level connections')
    expect(rendered).toHaveStyle({ width: '100%', height: '100%', objectFit: 'cover' })
  })

  it('shows the striped placeholder in the slot until an asset url exists', () => {
    render(<RenderedImage {...props} surface="card" assetUrl={() => undefined} />)
    expect(screen.getByText(PUBLICATION_ASSET_NAME)).toBeInTheDocument()
  })

  it('renders nothing about the caption or the variants at card size', () => {
    render(<RenderedImage {...props} surface="card" />)
    expect(screen.queryByTestId('output-preview')).toBeNull()
    expect(screen.queryByTestId('output-typed-values')).toBeNull()
  })
})
