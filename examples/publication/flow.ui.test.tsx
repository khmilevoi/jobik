import { isFlowUiDescriptor } from '@jobik/ui'
import { describe, expect, it } from 'vitest'
import { RenderedImage } from './components/RenderedImage.js'
import flowUi from './flow.ui.js'

describe('the publication flow UI extension', () => {
  it('is a descriptor the loader will accept', () => {
    expect(isFlowUiDescriptor(flowUi)).toBe(true)
  })

  it('registers RenderedImage under the node id the builder assigns', () => {
    expect(Object.keys(flowUi.nodes)).toEqual(['render'])
    expect(flowUi.nodes.render.Output).toBe(RenderedImage)
  })
})
