import { describe, expect, it } from 'vitest'
import { runPanelColors } from '#run/runPanelTokens.js'
import { shellColors } from './shellTokens.js'

/**
 * The three failed-header colours are declared in two places on purpose — here and in
 * `run/runPanelTokens.ts` — so neither directory's token module becomes a shared layer for the
 * other and `shell/RunDock` never needs a `run/` stylesheet on the page to draw a failed run.
 * This is the same guard `runPanelTokens.test.ts` puts on the values canvas and run both carry:
 * duplicated is fine, drifted is not.
 */
describe('shellColors', () => {
  it('agrees with runPanelColors on every value both directories carry', () => {
    expect(shellColors.failedFrame).toBe(runPanelColors.failedFrame)
    expect(shellColors.failedHeaderWash).toBe(runPanelColors.failedHeaderWash)
    expect(shellColors.failedTitle).toBe(runPanelColors.failedTitle)
  })
})
