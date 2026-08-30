import { describe, expect, it } from 'vitest'
import { canvasColors } from '../canvas/canvasTokens.js'
import * as tokens from '../tokens.js'
import { outputColors, outputMetrics } from './outputTokens.js'

describe('output viewer tokens', () => {
  it('carries the two colours the Output viewer artboard adds', () => {
    // design 901 — the `n / m` badge scrim; design 928 — the empty variant label.
    expect(outputColors).toEqual({
      badgeScrim: 'rgba(5,5,6,.72)',
      emptyVariantLabel: '#3f4549',
    })
  })

  it('re-declares no colour another token layer already owns', () => {
    const owned = new Set<string>()
    const visit = (value: unknown): void => {
      if (typeof value === 'string') {
        owned.add(value.toLowerCase())
        return
      }
      if (value !== null && typeof value === 'object') {
        for (const item of Object.values(value)) visit(item)
      }
    }
    visit(tokens)
    visit(canvasColors)
    for (const value of Object.values(outputColors)) {
      expect(owned.has(value.toLowerCase()), `${value} is already a shared token`).toBe(false)
    }
  })

  it('fixes the artboard geometry', () => {
    expect(outputMetrics.headerHeight).toBe(40) // design 881
    expect(outputMetrics.primaryColumnWidth).toBe(336) // design 897
    expect(outputMetrics.primaryImageHeight).toBe(236) // design 898
    expect(outputMetrics.primaryImageRadius).toBe(6) // design 898 — the shared ramp has no 6
    expect(outputMetrics.variantHeight).toBe(112) // design 913
    expect(outputMetrics.typedValuesLabelWidth).toBe(110) // design 938
    expect(outputMetrics.bodyPadding).toBe(18) // design 896
    expect(outputMetrics.rawPadding).toBe(16) // design 963
  })
})
