import { describe, expect, it } from 'vitest'
import { studioColors, studioMetrics } from './studioTokens.js'

describe('studioColors', () => {
  it('carries the two accent alphas the running chip adds', () => {
    expect(studioColors.runningChipBorder).toBe('rgba(31,214,189,.3)')
    expect(studioColors.runningChipFill).toBe('rgba(31,214,189,.06)')
  })
})

describe('studioMetrics', () => {
  it('matches the Studio — run in progress artboard', () => {
    expect(studioMetrics.chipHeight).toBe(28)
    expect(studioMetrics.chipActionHeight).toBe(20)
  })
})
