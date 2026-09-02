import { describe, expect, it } from 'vitest'
import { canvasColors, canvasMetrics } from './canvasTokens.js'

describe('canvasColors', () => {
  it('carries the canvas values transcribed from the artboards', () => {
    expect(canvasColors.dotGrid).toBe('#191c1f')
    expect(canvasColors.edgeIdle).toBe('#2c3236')
    expect(canvasColors.edgeWaiting).toBe('#23272b')
    expect(canvasColors.handleFill).toBe('#0b0c0d')
    expect(canvasColors.handleIdle).toBe('#3a4045')
    expect(canvasColors.handleDim).toBe('#2b3034')
    expect(canvasColors.progressTrack).toBe('#16191c')
    expect(canvasColors.skeletonHighlight).toBe('#161a1d')
    expect(canvasColors.stripeBase).toBe('#0e1113')
    expect(canvasColors.stripeLine).toBe('#14181a')
    expect(canvasColors.placeholderBar).toBe('#141719')
    expect(canvasColors.zoomControlBorder).toBe('#202327')
  })

  it('carries the accent inline link hover the `inspect` action swaps to', () => {})

  it('carries the title steps and the dimmed text steps', () => {
    expect(canvasColors.titleSelected).toBe('#eef1f3')
    expect(canvasColors.titleFailed).toBe('#f0e6e4')
    expect(canvasColors.titleCached).toBe('#b3b9be')
    expect(canvasColors.fieldLabelDim).toBe('#6d757c')
    expect(canvasColors.annotationDim).toBe('#4a5157')
    expect(canvasColors.sectionLabelSelected).toBe('#535a60')
    expect(canvasColors.cachedHeaderDivider).toBe('#191c1f')
  })

  it('carries the failed card ramp', () => {
    expect(canvasColors.failedBorder).toBe('rgba(201,106,92,.45)')
    expect(canvasColors.failedHalo).toBe('0 0 0 3px rgba(201,106,92,.05)')
    expect(canvasColors.failedHeaderWash).toBe('rgba(201,106,92,.06)')
    expect(canvasColors.failedHeaderDivider).toBe('#241b1a')
    expect(canvasColors.failedWellBorder).toBe('#2a1f1e')
    expect(canvasColors.failedActionBorder).toBe('#332725')
    expect(canvasColors.failedActionLabel).toBe('#cfc4c1')
    expect(canvasColors.failedSolidLabel).toBe('#1a0d0b')
  })

  it('carries the `3B` retrying card ramp', () => {
    expect(canvasColors.retryingBorder).toBe('#241b1a')
    expect(canvasColors.retryingHeaderWash).toBe('rgba(31,214,189,.04)')
  })

  it('builds the skeleton shimmer from the image placeholder and its highlight', () => {
    expect(canvasColors.skeleton).toBe(
      'linear-gradient(100deg,#0d0f11 30%,#161a1d 50%,#0d0f11 70%)',
    )
    expect(canvasMetrics.skeletonBackgroundSize).toBe('220% 100%')
  })
})

describe('canvasMetrics', () => {
  it('carries the grid, handle, edge and card metrics from the artboards', () => {
    expect(canvasMetrics.dotGridGap).toBe(22)
    expect(canvasMetrics.dotRadius).toBe(1)
    expect(canvasMetrics.dotGridOffset).toBe(-1)
    expect(canvasMetrics.handleSize).toBe(8)
    expect(canvasMetrics.handleBorderWidth).toBe(1.5)
    expect(canvasMetrics.handleOffset).toBe(-4)
    expect(canvasMetrics.edgeStrokeWidth).toBe(1.3)
    expect(canvasMetrics.edgeActiveStrokeWidth).toBe(1.4)
    expect(canvasMetrics.edgeActiveDash).toBe('5 7')
    expect(canvasMetrics.edgeWaitingDash).toBe('3 5')
    expect(canvasMetrics.steppedElbowStagger).toBe(16)
    expect(canvasMetrics.cardPaddingX).toBe(12)
    expect(canvasMetrics.headerRadius).toBe(6)
    expect(canvasMetrics.progressBarHeight).toBe(2)
    expect(canvasMetrics.kindDotSize).toBe(6)
    expect(canvasMetrics.statusDotSize).toBe(5)
    expect(canvasMetrics.cachedOpacity).toBe(0.55)
  })

  it('carries the three node widths the design uses', () => {
    expect(canvasMetrics.nodeWidth).toEqual({ start: 230, withSlot: 316, plain: 236 })
  })

  it('carries the output slot, state body and zoom control metrics', () => {
    expect(canvasMetrics.outputSlotGutter).toBe(10)
    expect(canvasMetrics.outputSlotHeight).toBe(180)
    expect(canvasMetrics.outputSlotMediaHeight).toBe(140)
    expect(canvasMetrics.outputSlotCaptionHeight).toBe(18)
    expect(canvasMetrics.stateBodyPadding).toBe(12)
    expect(canvasMetrics.stateMediaHeight).toBe(96)
    expect(canvasMetrics.placeholderBarHeight).toBe(6)
    expect(canvasMetrics.zoomButtonSize).toBe(26)
    expect(canvasMetrics.zoomControlsInset).toEqual({ left: 20, bottom: 16 })
  })
})
