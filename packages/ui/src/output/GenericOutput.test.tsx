import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { canvasColors } from '../canvas/canvasTokens.js'
import { NodeOutputSlot } from '../canvas/NodeOutputSlot.js'
import type { OutputComponentProps } from './flowUi.js'
import { GenericOutput, resolveOutputComponent } from './GenericOutput.js'

afterEach(cleanup)

const output = {
  image: { type: 'Buffer', mime: 'image/png', bytes: 654336, id: 'a1' },
  caption: 'Release 0.4',
}

const props: OutputComponentProps = {
  nodeId: 'render',
  output,
  surface: 'viewer',
  assetUrl: () => undefined,
}

function Custom() {
  return <div data-testid="custom" />
}

describe('GenericOutput', () => {
  it('serialises the node output as the same line-numbered JSON the Raw tab uses', () => {
    render(<GenericOutput {...props} />)
    const block = screen.getByTestId('generic-output')
    expect(block).toHaveTextContent('"caption": "Release 0.4"')
    expect(block).toHaveTextContent('"type": "Buffer"')
    expect(screen.getAllByTestId('raw-json-gutter').length).toBeGreaterThan(0)
  })

  it('scrolls inside the node card slot instead of overflowing it', () => {
    render(<GenericOutput {...props} surface="card" />)
    expect(screen.getByTestId('generic-output')).toHaveStyle({
      width: '100%',
      height: '100%',
      overflow: 'auto',
    })
  })

  it('fits the 140px inline slot P7 left for it', () => {
    render(
      <NodeOutputSlot
        slot={{ content: <GenericOutput {...props} surface="card" /> }}
        captionColor={canvasColors.metadata}
      />,
    )
    expect(screen.getByTestId('node-output-media')).toHaveStyle({ height: '140px' })
    expect(screen.getByTestId('generic-output')).toBeInTheDocument()
    expect(screen.getByTestId('node-output-media')).not.toHaveTextContent('image output')
  })
})

describe('resolveOutputComponent', () => {
  it('returns the registered component for the node', () => {
    const descriptor = { nodes: { render: { Output: Custom } } }
    expect(resolveOutputComponent(descriptor, 'render')).toBe(Custom)
  })

  it('falls back to the generic viewer for an unregistered node', () => {
    expect(resolveOutputComponent({ nodes: { render: { Output: Custom } } }, 'publish')).toBe(
      GenericOutput,
    )
  })

  it('falls back when the flow ships no extension at all', () => {
    expect(resolveOutputComponent(undefined, 'render')).toBe(GenericOutput)
  })
})
