import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { borders, motion, surfaces, textColors } from '../tokens.js'
import { canvasColors } from './canvasTokens.js'
import { NodeOutputSlot } from './NodeOutputSlot.js'

afterEach(cleanup)

describe('NodeOutputSlot', () => {
  it('sits in a 10px gutter inside the 180px output well', () => {
    render(<NodeOutputSlot slot={{}} captionColor={canvasColors.metadata} />)
    expect(screen.getByTestId('node-output-slot')).toHaveStyle({ padding: '10px' })
    expect(screen.getByTestId('node-output-well')).toHaveStyle({
      height: '180px',
      border: `1px solid ${borders.inset}`,
      background: surfaces.outputWell,
      padding: '8px',
    })
  })

  it('shows the striped image placeholder at 140px when nothing fills it', () => {
    render(<NodeOutputSlot slot={{}} captionColor={canvasColors.metadata} />)
    const media = screen.getByTestId('node-output-media')
    expect(media).toHaveStyle({ height: '140px', background: surfaces.imagePlaceholder })
    expect(media).toHaveTextContent('image output')
  })

  it('renders whatever P12 supplies instead of the placeholder', () => {
    render(
      <NodeOutputSlot
        slot={{ content: <img alt="rendered output" src="blob:x" /> }}
        captionColor={canvasColors.metadata}
      />,
    )
    expect(screen.getByAltText('rendered output')).toBeInTheDocument()
    expect(screen.getByTestId('node-output-media')).not.toHaveTextContent('image output')
  })

  it('shimmers with a pulsing label while the node is running', () => {
    render(
      <NodeOutputSlot
        slot={{ skeleton: true, skeletonLabel: 'rasterising 1024×1024' }}
        captionColor={textColors.sectionLabel}
      />,
    )
    const media = screen.getByTestId('node-output-media')
    expect(media).toHaveStyle({
      background: canvasColors.skeleton,
      animation: motion.shimmer,
    })
    expect((media as HTMLElement).style.backgroundSize).toBe('220% 100%')
    const label = screen.getByTestId('node-output-skeleton-label')
    expect(label).toHaveTextContent('rasterising 1024×1024')
    expect(label).toHaveStyle({ animation: motion.pulseSlow, color: canvasColors.annotationDim })
  })

  it('renders the caption row with caller colour and muted source', () => {
    render(
      <NodeOutputSlot
        slot={{ caption: '1024×1024 · png · 412 kb', source: 'imageOut' }}
        captionColor={canvasColors.metadata}
      />,
    )
    const caption = screen.getByTestId('node-output-caption')
    expect(caption).toHaveStyle({ height: '18px', fontSize: '9.5px', color: canvasColors.metadata })
    expect(caption).toHaveTextContent('1024×1024 · png · 412 kb')
    expect(screen.getByTestId('node-output-source')).toHaveStyle({
      color: textColors.sectionLabel,
    })
  })

  it('omits the caption row entirely when there is nothing to say', () => {
    render(<NodeOutputSlot slot={{}} captionColor={canvasColors.metadata} />)
    expect(screen.queryByTestId('node-output-caption')).toBeNull()
  })
})
