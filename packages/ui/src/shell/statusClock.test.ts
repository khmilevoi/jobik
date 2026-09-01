import { context, wrap } from '@reatom/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reatomStatusClock } from './statusClock.js'

/**
 * The clock `3D`'s status strip counts up on, tested where it lives rather than through the
 * component: the contract is a lifetime, and a lifetime is a thing to assert on a unit.
 *
 * **Every `await` here is a `wrap`ped one.** `context.start(async …)` holds its frame only across
 * wrapped boundaries; a bare `await` resumes in the default context, where these atoms were never
 * written and every read after it answers nothing (RTM-A04).
 */

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

const elapse = (ms: number) => wrap(vi.advanceTimersByTimeAsync(ms))

describe('reatomStatusClock', () => {
  it('re-reads the clock once a second while something is watching', async () => {
    await context.start(async () => {
      let now = 0
      const clock = reatomStatusClock(() => now, 'test.clock')
      const seen: number[] = []
      const unsubscribe = clock.now.subscribe((value) => seen.push(value))
      expect(seen).toEqual([0])

      now = 3_000
      await elapse(1_000)
      now = 7_000
      await elapse(1_000)

      // One read per second, and no read between them: the strip repaints on the tick and on
      // nothing else.
      expect(seen).toEqual([0, 3_000, 7_000])

      unsubscribe()
    })
  })

  it('stops when nothing is watching, and leaves no timer behind', async () => {
    await context.start(async () => {
      let now = 0
      const clock = reatomStatusClock(() => now, 'test.clock')
      const seen: number[] = []
      const unsubscribe = clock.now.subscribe((value) => seen.push(value))

      now = 1_000
      await elapse(1_000)
      const whileWatched = seen.length
      expect(whileWatched).toBeGreaterThan(1)

      unsubscribe()
      now = 60_000
      await elapse(10_000)

      // Ten seconds with nobody reading and not one further notification — and, the half a
      // `setInterval` could never give, not one further timer either.
      expect(seen.length).toBe(whileWatched)
      expect(vi.getTimerCount()).toBe(0)
    })
  })

  it('starts again when something reads it a second time', async () => {
    await context.start(async () => {
      let now = 0
      const clock = reatomStatusClock(() => now, 'test.clock')
      const first: number[] = []
      const stopFirst = clock.now.subscribe((value) => first.push(value))
      await elapse(1_000)
      stopFirst()

      now = 42_000
      const second: number[] = []
      const stopSecond = clock.now.subscribe((value) => second.push(value))
      await elapse(1_000)

      expect(second.at(-1)).toBe(42_000)
      stopSecond()
    })
  })
})
