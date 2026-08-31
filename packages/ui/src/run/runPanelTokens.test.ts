import { describe, expect, it } from 'vitest'
import { canvasColors } from '#canvas/canvasTokens.js'
import { textColors } from '#tokens.js'
import { runPanelColors, runPanelMetrics } from './runPanelTokens.js'

describe('runPanelColors', () => {
  it('carries the values the run panel adds to P4 tokens', () => {
    expect(runPanelColors.note).toBe('#767e85')
    expect(runPanelColors.controlValue).toBe('#d5dade')
    expect(runPanelColors.progressTrack).toBe('#16191c')
    expect(runPanelColors.activeRowBorder).toBe('rgba(31,214,189,.18)')
    expect(runPanelColors.queuedDotBorder).toBe('#34393d')
    expect(runPanelColors.queuedNodeName).toBe('#6d757c')
    expect(runPanelColors.lastRunNodeName).toBe('#636c73')
    expect(runPanelColors.skeletonHighlight).toBe('#161a1d')
  })

  it('carries the failed card ramp, whose header wash is .05 and not the node card .06', () => {
    expect(runPanelColors.failedFrame).toBe('#241b1a')
    expect(runPanelColors.failedHeaderWash).toBe('rgba(201,106,92,.05)')
    expect(runPanelColors.failedTitle).toBe('#f0e6e4')
    expect(runPanelColors.errorWellBorder).toBe('#2a1f1e')
    expect(runPanelColors.failedHeaderWash).not.toBe(canvasColors.failedHeaderWash)
  })

  it('builds the partial-output shimmer from the image placeholder and its highlight', () => {
    expect(runPanelColors.skeleton).toBe(
      'linear-gradient(100deg,#0d0f11 30%,#161a1d 50%,#0d0f11 70%)',
    )
  })

  it('stays in step with the canvas values transcribed from the same artboards', () => {
    expect(runPanelColors.progressTrack).toBe(canvasColors.progressTrack)
    expect(runPanelColors.skeletonHighlight).toBe(canvasColors.skeletonHighlight)
    expect(runPanelColors.queuedNodeName).toBe(canvasColors.fieldLabelDim)
    expect(runPanelColors.lastRunNodeName).toBe(textColors.metadata)
    expect(runPanelColors.failedFrame).toBe(canvasColors.failedHeaderDivider)
    expect(runPanelColors.failedTitle).toBe(canvasColors.titleFailed)
    expect(runPanelColors.errorWellBorder).toBe(canvasColors.failedWellBorder)
  })
})

describe('runPanelMetrics', () => {
  it('carries the card, progress, dot and row metrics from the artboards', () => {
    expect(runPanelMetrics.cardWidth).toBe(320)
    expect(runPanelMetrics.cardHeight).toBe(430)
    expect(runPanelMetrics.cardBodyPadding).toBe('16px 14px')
    expect(runPanelMetrics.cardBodyGap).toBe(14)
    expect(runPanelMetrics.progressBarHeight).toBe(3)
    expect(runPanelMetrics.spinnerSize).toBe(9)
    expect(runPanelMetrics.spinnerBorderWidth).toBe(1.5)
    expect(runPanelMetrics.statusDotSize).toBe(5)
    expect(runPanelMetrics.squareDotSize).toBe(6)
    expect(runPanelMetrics.nodeRowHeight).toBe(30)
    expect(runPanelMetrics.nodeRowPaddingX).toBe(8)
    expect(runPanelMetrics.nodeRowGap).toBe(2)
    expect(runPanelMetrics.timingRowGap).toBe(6)
  })

  it('carries the control, well, log and output metrics from the artboards', () => {
    expect(runPanelMetrics.markdownAreaHeight).toBe(118)
    expect(runPanelMetrics.wellPaddingBlock).toBe('10px')
    expect(runPanelMetrics.wellPaddingText).toBe('8px 10px')
    expect(runPanelMetrics.wellPaddingError).toBe('11px')
    expect(runPanelMetrics.partialMediaHeight).toBe(70)
    expect(runPanelMetrics.partialCaptionHeight).toBe(9)
    expect(runPanelMetrics.partialCaptionWidth).toBe('70%')
    expect(runPanelMetrics.skeletonBackgroundSize).toBe('220% 100%')
    expect(runPanelMetrics.thumbnailSize).toBe(54)
    expect(runPanelMetrics.actionHeight).toBe(34)
    expect(runPanelMetrics.logLineGap).toBe(5)
    expect(runPanelMetrics.caretWidth).toBe(3)
    expect(runPanelMetrics.caretHeight).toBe(9)
    expect(runPanelMetrics.outputRowGap).toBe(9)
  })
})
