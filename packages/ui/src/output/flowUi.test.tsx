import { describe, expect, it } from 'vitest'
import type { OutputComponentProps } from './flowUi.js'
import { defineFlowUi, isAssetDescriptor, isFlowUiDescriptor } from './flowUi.js'

function RenderedImage(props: OutputComponentProps) {
  return <div>{props.nodeId}</div>
}

const descriptor = { type: 'Buffer', mime: 'image/png', bytes: 654336, id: 'a1' } as const

describe('defineFlowUi', () => {
  it('returns the descriptor it was given, for typing only', () => {
    const value = defineFlowUi({ nodes: { render: { Output: RenderedImage } } })
    expect(value.nodes.render.Output).toBe(RenderedImage)
  })
})

describe('isFlowUiDescriptor', () => {
  it('accepts what defineFlowUi produced', () => {
    expect(isFlowUiDescriptor(defineFlowUi({ nodes: { render: { Output: RenderedImage } } }))).toBe(
      true,
    )
    expect(isFlowUiDescriptor({ nodes: {} })).toBe(true)
  })

  it('rejects anything a loader must not mount', () => {
    expect(isFlowUiDescriptor(undefined)).toBe(false)
    expect(isFlowUiDescriptor(null)).toBe(false)
    expect(isFlowUiDescriptor({})).toBe(false)
    expect(isFlowUiDescriptor({ nodes: { render: {} } })).toBe(false)
    expect(isFlowUiDescriptor({ nodes: { render: { Output: 'nope' } } })).toBe(false)
    expect(isFlowUiDescriptor({ nodes: [] })).toBe(false)
    expect(isFlowUiDescriptor({ nodes: [{ Output: RenderedImage }] })).toBe(false)
  })
})

describe('isAssetDescriptor', () => {
  it('recognises the wire shape of a binary field', () => {
    expect(isAssetDescriptor(descriptor)).toBe(true)
  })

  it('rejects everything else a report can hold', () => {
    expect(isAssetDescriptor('cover.png')).toBe(false)
    expect(isAssetDescriptor(null)).toBe(false)
    expect(isAssetDescriptor({ type: 'Buffer', mime: 'image/png', bytes: 1 })).toBe(false)
    expect(isAssetDescriptor({ ...descriptor, type: 'Blob' })).toBe(false)
    expect(isAssetDescriptor({ ...descriptor, bytes: '654336' })).toBe(false)
  })
})
