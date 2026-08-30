import { describe, expect, it } from 'vitest'
import { accent, motion } from '../tokens.js'
import { canvasColors } from './canvasTokens.js'
import { curvedFieldPath, fieldEdgePath, fieldEdgeStyle, steppedFieldPath } from './edgePaths.js'

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

describe('fieldEdgeStyle', () => {
  it('accents an edge leaving the selected start at 1.3px', () => {
    expect(fieldEdgeStyle('accent')).toEqual({ stroke: accent.cssVar, strokeWidth: 1.3 })
  })

  it('draws every other resting edge in the idle stroke', () => {
    expect(fieldEdgeStyle('idle')).toEqual({ stroke: canvasColors.edgeIdle, strokeWidth: 1.3 })
  })

  it('runs the .8s dash loop on an active edge, at 1.4px', () => {
    expect(fieldEdgeStyle('active')).toEqual({
      stroke: accent.cssVar,
      strokeWidth: 1.4,
      strokeDasharray: '5 7',
      animation: motion.edgeDash,
    })
  })

  it('leaves a waiting edge statically dashed', () => {
    expect(fieldEdgeStyle('waiting')).toEqual({
      stroke: canvasColors.edgeWaiting,
      strokeWidth: 1.3,
      strokeDasharray: '3 5',
    })
  })
})
