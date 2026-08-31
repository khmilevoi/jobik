import { describe, expect, it } from 'vitest'
import { canvasColors } from '#canvas/canvasTokens.js'
import * as tokens from '#tokens.js'
import { outputColors, outputMetrics } from './outputTokens.js'

describe('output viewer tokens', () => {
  it('carries the three colours the two output artboards add', () => {
    // design 901 — the `n / m` badge scrim; design 928 — the empty variant label;
    // `10-output-dock.md` §2.1 — the dock's 38 × 2 grab bar.
    expect(outputColors).toEqual({
      badgeScrim: 'rgba(5,5,6,.72)',
      emptyVariantLabel: '#3f4549',
      dockResizeHandle: '#1e2226',
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

  it('fixes the `2A` output dock geometry', () => {
    expect(outputMetrics.dockHeight).toBe(378) // `10-output-dock.md` §1
    expect(outputMetrics.dockCollapsedHeight).toBe(34) // §3
    expect(outputMetrics.dockHandleHeight).toBe(7) // §2.1
    expect(outputMetrics.dockHandleWidth).toBe(38) // §2.1
    expect(outputMetrics.dockHeaderPaddingRight).toBe(12) // §2.2 — `padding:0 12px 0 14px`
    expect(outputMetrics.dockPrimaryColumnWidth).toBe(372) // §2.3 — 336 on the standalone card
    expect(outputMetrics.dockRightColumnGap).toBe(14) // §2.3 — 12 on the standalone card
  })
})
