import type { Computed } from '@reatom/core'
import { atom, computed, peek, sleep, withConnectHook, wrap } from '@reatom/core'

/**
 * The one-second clock behind `3D`'s `checked <n> s ago`.
 *
 * `StatusStrip` used to keep a `setInterval` in a `useEffect` and bump a counter nobody read, which
 * is the shape RTM-L01/RTM-L02 exist to stop: a repeating effect whose lifetime is a handle in a
 * closure. Here the hold is `await wrap(sleep(TICK_MS))` inside a loop owned by
 * `withConnectHook` (RTM-A05, RTM-L01). There is no interval handle to leak, and — the part that
 * matters — **the loop only runs while something is reading `now`**. A strip nobody renders costs
 * nothing at all; `statusClock.test.ts` is the proof.
 *
 * It is a factory rather than a module singleton for the same reason the Studio model is one: two
 * strips on one page are two clocks, and a test that runs a clock must be able to throw it away.
 * `model/run.ts`'s `elapsedMs` is the same shape at 100ms, and is where this one was copied from.
 *
 * Deliberately **not** on `shell/index.ts`: the root barrel re-exports that file wholesale, and
 * this is a detail of one component rather than something a consumer should reach for.
 */

/** One second — the resolution `checked <n> s ago` is written in. */
const TICK_MS = 1000

export interface StatusClock {
  /**
   * The wall clock. Re-read once a second while something is subscribed to it, and frozen at
   * whatever it last answered when nothing is.
   */
  readonly now: Computed<number>
}

export function reatomStatusClock(now: () => number = Date.now, name = 'statusClock'): StatusClock {
  /** The loop's only writer, and `now` below is its only reader. */
  const tick = atom(0, `${name}._tick`)

  const nowMs = computed(() => {
    tick()
    return now()
  }, `${name}.now`).extend(
    withConnectHook(() => {
      let stopped = false
      const loop = async () => {
        try {
          while (!stopped) {
            await wrap(sleep(TICK_MS))
            if (stopped) return
            tick.set(peek(tick) + 1)
          }
        } catch {
          // `withConnectHook` aborts every `wrap` it owns on disconnect, which rejects the pending
          // `sleep`. That is this loop ending, not a failure to report.
        }
      }
      void loop()
      return () => {
        stopped = true
      }
    }),
  )

  return { now: nowMs }
}
