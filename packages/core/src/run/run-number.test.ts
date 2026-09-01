import { describe, expect, it } from 'vitest'
import { nextRunNumber, releaseRunNumber } from './run-number.js'

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

describe('releaseRunNumber()', () => {
  it('gives the highest number back, so the next run reuses it', () => {
    const flowPath = '/flows/released/flow.jobik.json'

    expect(nextRunNumber(flowPath)).toBe(1)
    releaseRunNumber(flowPath, 1)

    expect(nextRunNumber(flowPath)).toBe(1)
  })

  it('refuses to give back a number a later run has already passed', () => {
    const flowPath = '/flows/overtaken/flow.jobik.json'

    const rejectedLater = nextRunNumber(flowPath)
    const stillRunning = nextRunNumber(flowPath)
    expect([rejectedLater, stillRunning]).toEqual([1, 2])

    // Returning #1 now would either hand it to a third run while #2 is live — two runs numbered
    // out of order — or reuse it outright. The gap is the lesser of the three.
    releaseRunNumber(flowPath, rejectedLater)

    expect(nextRunNumber(flowPath)).toBe(3)
  })

  it('ignores a flow it has never numbered', () => {
    releaseRunNumber('/flows/unknown/flow.jobik.json', 7)

    expect(nextRunNumber('/flows/unknown/flow.jobik.json')).toBe(1)
  })
})
