import { describe, expect, it } from 'vitest'
import { accent, textColors } from '../tokens.js'
import { canvasColors } from './canvasTokens.js'
import {
  endpointKey,
  fieldAnnotationColor,
  fieldHandleId,
  fieldHandleStyle,
  fieldLabelColor,
  liveEndpointKeys,
  parseFieldHandleId,
  resolveEdgeTone,
  resolveFieldTone,
  resolveHandleTone,
} from './fields.js'
import type { FlowCanvasEdge } from './types.js'

describe('resolveFieldTone', () => {
  it('dims a field whose annotation is pending or waiting', () => {
    expect(resolveFieldTone({ name: 'image', annotation: 'pending' }, false)).toBe('dim')
    expect(resolveFieldTone({ name: 'image', annotation: 'waiting' }, false)).toBe('dim')
  })

  it('activates every field on a start node', () => {
    expect(resolveFieldTone({ name: 'title', annotation: 'string' }, true)).toBe('active')
  })

  it('leaves an ordinary field, including a received one, on the normal step', () => {
    expect(resolveFieldTone({ name: 'title', annotation: 'string' }, false)).toBe('normal')
    expect(resolveFieldTone({ name: 'title', annotation: 'received' }, false)).toBe('normal')
  })

  it('lets an explicit tone win over both rules', () => {
    expect(resolveFieldTone({ name: 'x', annotation: 'pending', tone: 'normal' }, true)).toBe(
      'normal',
    )
  })
})

describe('field colours', () => {
  it('maps each tone to its artboard label and annotation step', () => {
    expect(fieldLabelColor('active')).toBe(textColors.activeFieldLabel)
    expect(fieldLabelColor('normal')).toBe(textColors.fieldLabel)
    expect(fieldLabelColor('dim')).toBe(canvasColors.fieldLabelDim)
    expect(fieldAnnotationColor('active')).toBe(textColors.typeAnnotation)
    expect(fieldAnnotationColor('normal')).toBe(textColors.typeAnnotation)
    expect(fieldAnnotationColor('dim')).toBe(canvasColors.annotationDim)
  })
})

describe('handle ids', () => {
  it('round-trips a direction and a field name', () => {
    expect(fieldHandleId('source', 'image')).toBe('source:image')
    expect(fieldHandleId('target', 'caption')).toBe('target:caption')
    expect(parseFieldHandleId('source:image')).toEqual({ direction: 'source', name: 'image' })
    expect(parseFieldHandleId('target:caption')).toEqual({ direction: 'target', name: 'caption' })
  })

  it('returns undefined for anything that is not one of ours', () => {
    expect(parseFieldHandleId(null)).toBeUndefined()
    expect(parseFieldHandleId(undefined)).toBeUndefined()
    expect(parseFieldHandleId('image')).toBeUndefined()
    expect(parseFieldHandleId('sideways:image')).toBeUndefined()
    expect(parseFieldHandleId('source:')).toBeUndefined()
  })
})

describe('fieldHandleStyle', () => {
  it('draws the 8px circle at the design offset, on the correct edge', () => {
    const source = fieldHandleStyle('idle', 'source')
    expect(source).toMatchObject({
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: canvasColors.handleFill,
      border: `1.5px solid ${canvasColors.handleIdle}`,
      right: '-4px',
      top: '50%',
      transform: 'translateY(-50%)',
    })
    expect(source.left).toBeUndefined()

    const target = fieldHandleStyle('accent', 'target')
    expect(target.left).toBe('-4px')
    expect(target.right).toBeUndefined()
    expect(target.border).toBe(`1.5px solid ${accent.cssVar}`)
  })

  it('uses the dim border for a pending or waiting field', () => {
    expect(fieldHandleStyle('dim', 'source').border).toBe(`1.5px solid ${canvasColors.handleDim}`)
  })
})

const edge = (over: Partial<FlowCanvasEdge> = {}): FlowCanvasEdge => ({
  id: 'e1',
  source: 'start1',
  sourceField: 'title',
  target: 'render',
  targetField: 'title',
  ...over,
})

describe('resolveEdgeTone', () => {
  it('accents an edge leaving the selected start and idles everything else', () => {
    expect(resolveEdgeTone(edge(), 'start1')).toBe('accent')
    expect(resolveEdgeTone(edge({ source: 'render', target: 'publish' }), 'start1')).toBe('idle')
    expect(resolveEdgeTone(edge(), undefined)).toBe('idle')
  })

  it('lets a run tone win', () => {
    expect(resolveEdgeTone(edge({ tone: 'active' }), 'start1')).toBe('active')
    expect(resolveEdgeTone(edge({ tone: 'waiting' }), 'start1')).toBe('waiting')
  })
})

describe('liveEndpointKeys and resolveHandleTone', () => {
  const edges: readonly FlowCanvasEdge[] = [
    edge({ id: 'e1' }),
    edge({ id: 'e2', sourceField: 'markdown', targetField: 'markdown' }),
    edge({
      id: 'e3',
      source: 'render',
      sourceField: 'image',
      target: 'publish',
      targetField: 'image',
    }),
  ]

  it('collects both endpoints of every accent and active edge, and nothing else', () => {
    const live = liveEndpointKeys(edges, 'start1')
    expect(live.has(endpointKey('start1', 'source', 'title'))).toBe(true)
    expect(live.has(endpointKey('render', 'target', 'title'))).toBe(true)
    expect(live.has(endpointKey('render', 'source', 'image'))).toBe(false)
    expect(live.has(endpointKey('publish', 'target', 'image'))).toBe(false)
  })

  it('treats an active edge as live too', () => {
    const live = liveEndpointKeys([edge({ tone: 'active' })], undefined)
    expect(live.has(endpointKey('start1', 'source', 'title'))).toBe(true)
  })

  it('reproduces the four handle tones the artboards show', () => {
    // start1's outputs and render's inputs sit on accent edges.
    expect(resolveHandleTone({ name: 'title', annotation: 'string' }, true, true)).toBe('accent')
    expect(resolveHandleTone({ name: 'title', annotation: 'received' }, false, true)).toBe('accent')
    // render's outputs and publish's inputs, at rest.
    expect(resolveHandleTone({ name: 'image', annotation: 'Buffer' }, false, false)).toBe('idle')
    // the same rows during a run.
    expect(resolveHandleTone({ name: 'image', annotation: 'pending' }, false, false)).toBe('dim')
    expect(resolveHandleTone({ name: 'image', annotation: 'waiting' }, false, false)).toBe('dim')
  })

  it('lets an explicit handle tone win', () => {
    expect(
      resolveHandleTone({ name: 'x', annotation: 'pending', handleTone: 'accent' }, false, false),
    ).toBe('accent')
  })
})
