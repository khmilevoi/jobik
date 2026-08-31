import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { textColors } from '../../tokens.js'
import { NodeOutputSlot } from './NodeOutputSlot.js'

afterEach(cleanup)

describe('NodeOutputSlot', () => {
  it('sits the media inside the output well', () => {
    render(<NodeOutputSlot slot={{}} captionColor={textColors.metadata} />)
    const well = screen.getByTestId('node-output-well')
    expect(screen.getByTestId('node-output-slot')).toContainElement(well)
    expect(well).toContainElement(screen.getByTestId('node-output-media'))
  })

  it('shows the striped image placeholder when nothing fills it', () => {
    render(<NodeOutputSlot slot={{}} captionColor={textColors.metadata} />)
    expect(screen.getByTestId('node-output-media')).toHaveTextContent('image output')
  })

  it('renders whatever P12 supplies instead of the placeholder', () => {
    render(
      <NodeOutputSlot
        slot={{ content: <img alt="rendered output" src="blob:x" /> }}
        captionColor={textColors.metadata}
      />,
    )
    expect(screen.getByAltText('rendered output')).toBeInTheDocument()
    expect(screen.getByTestId('node-output-media')).not.toHaveTextContent('image output')
  })

  it('shows the skeleton label instead of the placeholder while the node is running', () => {
    render(
      <NodeOutputSlot
        slot={{ skeleton: true, skeletonLabel: 'rasterising 1024×1024' }}
        captionColor={textColors.sectionLabel}
      />,
    )
    expect(screen.getByTestId('node-output-media')).not.toHaveTextContent('image output')
    expect(screen.getByTestId('node-output-skeleton-label')).toHaveTextContent(
      'rasterising 1024×1024',
    )
  })

  it('omits the skeleton label when the caller has nothing to say', () => {
    render(<NodeOutputSlot slot={{ skeleton: true }} captionColor={textColors.metadata} />)
    expect(screen.queryByTestId('node-output-skeleton-label')).toBeNull()
  })

  it('renders the caption row with the caller colour and the source on the right', () => {
    render(
      <NodeOutputSlot
        slot={{ caption: '1024×1024 · png · 412 kb', source: 'imageOut' }}
        captionColor={textColors.metadata}
      />,
    )
    const caption = screen.getByTestId('node-output-caption')
    expect(caption).toHaveTextContent('1024×1024 · png · 412 kb')
    expect(caption.style.getPropertyValue('--jbk-node-caption-color')).toBe(textColors.metadata)
    expect(screen.getByTestId('node-output-source')).toHaveTextContent('imageOut')
  })

  it('renders a caption row for a source alone', () => {
    render(<NodeOutputSlot slot={{ source: 'imageOut' }} captionColor={textColors.metadata} />)
    expect(screen.getByTestId('node-output-caption')).toBeInTheDocument()
    expect(screen.getByTestId('node-output-source')).toHaveTextContent('imageOut')
  })

  it('omits the caption row entirely when there is nothing to say', () => {
    render(<NodeOutputSlot slot={{}} captionColor={textColors.metadata} />)
    expect(screen.queryByTestId('node-output-caption')).toBeNull()
  })
})
