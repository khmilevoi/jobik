import { describe, expect, it } from 'vitest'
import {
  endpointKey,
  fieldAnnotationClass,
  fieldHandleClass,
  fieldHandleId,
  fieldLabelClass,
  liveEndpointKeys,
  parseFieldHandleId,
  resolveEdgeTone,
  resolveFieldTone,
  resolveHandleTone,
} from './fields.js'
import type { FieldHandleTone, FieldTone, FlowCanvasEdge } from './types.js'

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

const TONES: readonly FieldTone[] = ['active', 'normal', 'dim']

describe('field tone classes', () => {
  it('puts each of the three tones on its own label step', () => {
    expect(new Set(TONES.map((tone) => fieldLabelClass(tone))).size).toBe(TONES.length)
  })

  it('moves the annotation off the type step only when the row is dimmed', () => {
    expect(fieldAnnotationClass('active')).toBe(fieldAnnotationClass('normal'))
    expect(fieldAnnotationClass('dim')).not.toBe(fieldAnnotationClass('normal'))
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

const HANDLE_TONES: readonly FieldHandleTone[] = ['accent', 'idle', 'dim']

describe('fieldHandleClass', () => {
  it('hangs a source handle off the right edge and a target handle off the left', () => {
    expect(fieldHandleClass('idle', 'source')).not.toBe(fieldHandleClass('idle', 'target'))
  })

  it('gives each of the three tones its own border', () => {
    const bySource = HANDLE_TONES.map((tone) => fieldHandleClass(tone, 'source'))
    expect(new Set(bySource).size).toBe(HANDLE_TONES.length)
  })

  it('draws the same circle whatever the tone and whichever edge it sits on', () => {
    const shape = fieldHandleClass('accent', 'source').split(' ')[0]
    for (const tone of HANDLE_TONES) {
      expect(fieldHandleClass(tone, 'source').split(' ')[0]).toBe(shape)
      expect(fieldHandleClass(tone, 'target').split(' ')[0]).toBe(shape)
    }
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

/**
 * `3D`'s two port marks. `fields.ts` is a pure resolver, so what is asserted is the branching —
 * which parts of the chrome a mark replaces and which it leaves alone. The colours live in
 * `fields.module.css` and `canvasTokens.css.test.ts` keeps them honest.
 */
describe('the 3D field marks', () => {
  it('brightens only the receiving label, and leaves the other two marks on their own tone', () => {
    const plain = fieldLabelClass('normal')
    expect(fieldLabelClass('normal', 'mismatch')).not.toBe(plain)
    expect(fieldLabelClass('normal', 'linked')).toBe(plain)
    expect(fieldLabelClass('normal', 'unsourced')).toBe(plain)
  })

  it('recolours the annotation for every mark, whatever tone the row was on', () => {
    const marked = fieldAnnotationClass('normal', 'mismatch')
    expect(marked).not.toBe(fieldAnnotationClass('normal'))
    expect(fieldAnnotationClass('normal', 'linked')).toBe(marked)
    expect(fieldAnnotationClass('normal', 'unsourced')).toBe(marked)
    // A dim row that is also marked reads as marked, not as dim.
    expect(fieldAnnotationClass('dim', 'unsourced')).toBe(marked)
  })

  it('gives the unsourced port a handle of its own, distinct from the mismatching one', () => {
    const plain = fieldHandleClass('idle', 'target')
    const mismatch = fieldHandleClass('idle', 'target', 'mismatch')
    const unsourced = fieldHandleClass('idle', 'target', 'unsourced')

    expect(mismatch).not.toBe(plain)
    expect(unsourced).not.toBe(plain)
    expect(unsourced).not.toBe(mismatch)
    // The sending end takes the same solid ring the receiving end does.
    expect(fieldHandleClass('idle', 'source', 'linked')).toBe(
      fieldHandleClass('idle', 'source', 'mismatch'),
    )
    // Both stay the same 8px circle on the same edge; only the border changes.
    expect(mismatch.startsWith(plain)).toBe(true)
    expect(unsourced.startsWith(plain)).toBe(true)
  })
})
