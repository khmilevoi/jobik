import { describe, expect, it } from 'vitest'
import { nextRunNumber } from './run-number.js'

describe('nextRunNumber()', () => {
  it('starts a flow at 1 and increases by one per run', () => {
    const flowPath = '/flows/first/flow.jobik.json'

    expect(nextRunNumber(flowPath)).toBe(1)
    expect(nextRunNumber(flowPath)).toBe(2)
    expect(nextRunNumber(flowPath)).toBe(3)
  })

  it('counts each flow separately', () => {
    const a = '/flows/counted-a/flow.jobik.json'
    const b = '/flows/counted-b/flow.jobik.json'

    expect(nextRunNumber(a)).toBe(1)
    expect(nextRunNumber(a)).toBe(2)
    expect(nextRunNumber(b)).toBe(1)
    expect(nextRunNumber(a)).toBe(3)
  })
})
