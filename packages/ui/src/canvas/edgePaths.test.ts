import { describe, expect, it } from 'vitest'
import { curvedFieldPath, fieldEdgeClass, fieldEdgePath, steppedFieldPath } from './edgePaths.js'
import type { FieldEdgeTone } from './types.js'

/** `Studio — default`, the two accent runs from start1 to render. */
const first = { sourceX: 286, sourceY: 321, targetX: 386, targetY: 223 }
const second = { sourceX: 286, sourceY: 351, targetX: 386, targetY: 253 }

describe('curvedFieldPath', () => {
  it('reproduces the artboard curve exactly', () => {
    expect(curvedFieldPath(first)).toBe('M286,321 C 336,321 336,223 386,223')
    expect(curvedFieldPath(second)).toBe('M286,351 C 336,351 336,253 386,253')
  })

  it('trims the floating point tail React Flow coordinates carry', () => {
    expect(curvedFieldPath({ sourceX: 10.001, sourceY: 0, targetX: 20, targetY: 5.005 })).toBe(
      'M10,0 C 15,0 15,5.01 20,5.01',
    )
  })
})

describe('steppedFieldPath', () => {
  it('elbows at the horizontal midpoint by default', () => {
    expect(steppedFieldPath(first)).toBe('M286,321 H336 V223 H386')
  })

  it('shifts the elbow so parallel runs do not overlap, as the artboard does at +16', () => {
    expect(steppedFieldPath(second, 16)).toBe('M286,351 H352 V253 H386')
  })
})

describe('fieldEdgePath', () => {
  it('picks the builder from the edge shape', () => {
    expect(fieldEdgePath({ tone: 'idle', shape: 'curved' }, first)).toBe(curvedFieldPath(first))
    expect(fieldEdgePath({ tone: 'idle', shape: 'stepped' }, first)).toBe(steppedFieldPath(first))
    expect(fieldEdgePath({ tone: 'idle', shape: 'stepped', elbowOffset: 16 }, second)).toBe(
      'M286,351 H352 V253 H386',
    )
  })
})

const TONES: readonly FieldEdgeTone[] = ['accent', 'idle', 'active', 'waiting']

describe('fieldEdgeClass', () => {
  it('gives each of the four tones its own stroke', () => {
    expect(new Set(TONES.map(fieldEdgeClass)).size).toBe(TONES.length)
  })

  it('keeps every tone on the same base edge', () => {
    const base = fieldEdgeClass('idle').split(' ')[0]
    for (const tone of TONES) expect(fieldEdgeClass(tone).split(' ')[0]).toBe(base)
  })
})
