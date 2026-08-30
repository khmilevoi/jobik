import { describe, expect, it } from 'vitest'
import { cancelRun, inFlightRunCount, registerRun, releaseRun } from './runRegistry.js'

describe('runRegistry', () => {
  it('mints a distinct token per run and aborts the matching controller', () => {
    const first = new AbortController()
    const second = new AbortController()
    const firstToken = registerRun(first)
    const secondToken = registerRun(second)
    expect(firstToken).not.toBe(secondToken)

    expect(cancelRun(firstToken)).toBe(true)
    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(false)

    releaseRun(firstToken)
    releaseRun(secondToken)
  })

  it('reports an unknown token rather than throwing, so the route can answer 404', () => {
    expect(cancelRun('not-a-token')).toBe(false)
  })

  it('forgets a released run, so a stale token cannot abort a later one', () => {
    const controller = new AbortController()
    const token = registerRun(controller)
    releaseRun(token)
    expect(cancelRun(token)).toBe(false)
    expect(controller.signal.aborted).toBe(false)
  })

  it('leaves nothing behind once every run is released', () => {
    const before = inFlightRunCount()
    const token = registerRun(new AbortController())
    expect(inFlightRunCount()).toBe(before + 1)
    releaseRun(token)
    expect(inFlightRunCount()).toBe(before)
  })
})
