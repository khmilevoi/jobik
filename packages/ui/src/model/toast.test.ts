import { type Atom, atom, context, wrap } from '@reatom/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobikClient, WireRunReportPayload } from '#client/index.js'
import type { RunSession } from '#studio/runSession.js'
import { motion } from '#tokens.js'
import { reatomToast, TOAST_EXIT_MS, TOAST_HOLD_MS } from './toast.js'
import type { StudioDeps, ToastModel } from './types.js'

/**
 * F-C13's model. Every case here is about the two things a toast can get wrong: saying something
 * the wire did not carry, and outstaying or under-staying `4A`'s timings.
 *
 * Every promise this file awaits is a `wrap`ped one, for the reason `output.test.ts` states:
 * `context.start` holds its frame only across wrapped boundaries.
 */

const REPORT: WireRunReportPayload = {
  flowName: 'publication',
  startId: 'start1',
  runNumber: 219,
  status: 'ok',
  elapsedMs: 2400,
  nodes: [],
  logs: [],
  error: null,
}

function sessionOf(report: WireRunReportPayload): RunSession {
  return {
    startId: report.startId,
    runToken: `tok-${report.runNumber}`,
    runNumber: report.runNumber,
    nodeCount: report.nodes.length,
    startedAt: 0,
    nodes: new Map(),
    logs: report.logs,
    report,
    failure: undefined,
    cancelling: false,
  }
}

interface World {
  readonly toast: ToastModel
  /** `RunModel.archive`'s stand-in — newest first, exactly as the real one keeps it. */
  readonly archive: Atom<readonly RunSession[]>
  /** Settles a run into the archive, the one event this model reacts to. */
  readonly settle: (report: WireRunReportPayload) => Promise<unknown>
  /**
   * What a flow switch does to `RunModel.archive`: it does not push a run, it swaps the whole
   * slice for another flow's — see `run.ts:211-224`. Nothing settled here.
   */
  readonly swap: (sessions: readonly RunSession[]) => Promise<unknown>
  readonly elapse: (ms: number) => Promise<unknown>
  readonly disconnect: () => void
}

function createWorld(): World {
  const deps = { client: {} as unknown as JobikClient } satisfies StudioDeps
  const archive = atom<readonly RunSession[]>([], 'test.archive')
  const toast = reatomToast(deps, { archive }, 'studio.toast')

  // What `@reatom/react` does for the real Studio: the surface reads these, and reading `message`
  // is what installs the reaction behind it.
  const unsubscribes = [toast.message.subscribe(() => {}), toast.visible.subscribe(() => {})]

  const flush = (): Promise<unknown> =>
    wrap(
      (async () => {
        for (let hop = 0; hop < 4; hop += 1) await vi.advanceTimersByTimeAsync(0)
      })(),
    )

  return {
    toast,
    archive,
    // It returns `flush()` rather than awaiting it inside an `async` function, and that is
    // load-bearing: an `async` function's own promise is not `wrap`ped, so `await settle(…)` in a
    // case body would resume in the DEFAULT context and every read after it would see an atom
    // nobody had written (RTM-A04). `output.test.ts` states the same rule for the same reason.
    settle: (report) => {
      archive.set([sessionOf(report), ...archive()])
      return flush()
    },
    swap: (sessions) => {
      archive.set(sessions)
      return flush()
    },
    elapse: (ms: number) => wrap(vi.advanceTimersByTimeAsync(ms)),
    disconnect: () => {
      for (const unsubscribe of unsubscribes.splice(0)) unsubscribe()
    },
  }
}

async function withToast(body: (world: World) => Promise<void>): Promise<void> {
  await context.start(async () => {
    const world = createWorld()
    try {
      await wrap(body(world))
    } finally {
      world.disconnect()
    }
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the toast a settled run raises', () => {
  it('says nothing until a run has settled', async () => {
    await withToast(async ({ toast }) => {
      expect(toast.message()).toBeUndefined()
      expect(toast.visible()).toBe(false)
    })
  })

  it('prints the run’s own number and elapsed on success', async () => {
    await withToast(async ({ toast, settle }) => {
      await settle(REPORT)

      expect(toast.message()).toEqual({ text: 'Run #219 finished in 2.4s', tone: 'ok' })
      expect(toast.visible()).toBe(true)
    })
  })

  it('prints a failure without an elapsed the design never draws there', async () => {
    await withToast(async ({ toast, settle }) => {
      await settle({ ...REPORT, status: 'failed' })

      expect(toast.message()).toEqual({ text: 'Run #219 failed', tone: 'failed' })
    })
  })

  /**
   * A settled report's `status` has three arms and the toast is the only report some runs get, so
   * a toast that folded `cancelled` into `failed` would tell the user a run they stopped
   * themselves had failed. It reads the archive's own reports, which keep all three.
   */
  it('keeps cancelled distinct from failed', async () => {
    await withToast(async ({ toast, settle }) => {
      await settle({ ...REPORT, status: 'cancelled' })

      expect(toast.message()).toEqual({ text: 'Run #219 cancelled', tone: 'mute' })
    })
  })

  it('stands for the hold, then fades before it goes', async () => {
    await withToast(async ({ toast, settle, elapse }) => {
      await settle(REPORT)

      await elapse(TOAST_HOLD_MS - 1)
      expect(toast.visible()).toBe(true)

      await elapse(1)
      // Fading, not gone: the element must outlive `visible` or the 120ms exit plays to nobody.
      expect(toast.visible()).toBe(false)
      expect(toast.message()).not.toBeUndefined()

      await elapse(TOAST_EXIT_MS)
      expect(toast.message()).toBeUndefined()
    })
  })

  it('replaces the standing toast when a second run settles during its hold', async () => {
    await withToast(async ({ toast, settle, elapse }) => {
      await settle(REPORT)
      await elapse(TOAST_HOLD_MS / 2)

      await settle({ ...REPORT, runNumber: 220, status: 'failed' })

      expect(toast.message()).toEqual({ text: 'Run #220 failed', tone: 'failed' })
      expect(toast.visible()).toBe(true)

      // The first toast's hold was aborted rather than left running: it must not take the second
      // one away early.
      await elapse(TOAST_HOLD_MS / 2)
      expect(toast.visible()).toBe(true)
    })
  })

  /**
   * The archive is keyed by flow and a switch swaps the slice rather than clearing it, so the head
   * moves for a reason that is not a run finishing. Selecting a flow with no runs empties it, and
   * selecting the first one again puts the very same settled session back on top — which is a
   * change of the head, and must not be a second toast for a run announced minutes ago.
   */
  it('says nothing again when a flow switch brings a run it already announced back', async () => {
    await withToast(async ({ toast, archive, swap, settle, elapse }) => {
      await settle(REPORT)
      const announced = archive()
      await elapse(TOAST_HOLD_MS + TOAST_EXIT_MS)
      expect(toast.message()).toBeUndefined()

      // The flow with nothing in its archive.
      await swap([])
      expect(toast.message()).toBeUndefined()

      // …and back to the one that has run.
      await swap(announced)
      expect(toast.message()).toBeUndefined()
      expect(toast.visible()).toBe(false)
    })
  })

  it('says nothing when a flow switch swaps another flow’s settled runs in', async () => {
    await withToast(async ({ toast, archive, swap, settle, elapse }) => {
      await settle(REPORT)
      const first = archive()
      await elapse(TOAST_HOLD_MS + TOAST_EXIT_MS)

      // The other flow's own run, settled while that flow was selected: it is announced then.
      await swap([sessionOf({ ...REPORT, runNumber: 300 })])
      expect(toast.message()).toEqual({ text: 'Run #300 finished in 2.4s', tone: 'ok' })
      await elapse(TOAST_HOLD_MS + TOAST_EXIT_MS)

      // Switching back is not a run finishing, and #219 has been announced once already.
      await swap(first)
      expect(toast.message()).toBeUndefined()
      expect(toast.visible()).toBe(false)
    })
  })

  /**
   * The toast does not outlive the surface drawing it: nothing else in the model owns it, so the
   * hold in flight is dropped with the last reader rather than left to clear a later toast.
   */
  it('drops the standing toast and its hold when nothing is drawing it any more', async () => {
    await withToast(async ({ toast, settle, elapse, disconnect }) => {
      await settle(REPORT)
      expect(toast.visible()).toBe(true)

      disconnect()
      await elapse(0)

      // Gone with its reader, not merely gone once the hold it left behind ran out.
      expect(toast.message()).toBeUndefined()
      expect(toast.visible()).toBe(false)

      await elapse(TOAST_HOLD_MS + TOAST_EXIT_MS)
      expect(toast.message()).toBeUndefined()
    })
  })
})

/**
 * S10 — `TOAST_EXIT_MS` is `4A`'s exit duration written a second time, in the one place it cannot
 * be read from CSS. Every timing case above measures with the constant itself, so all of them pass
 * for any value of it; this is the one assertion that fails when the copy drifts from the token
 * the stylesheet actually fades on.
 */
describe('the exit constant and the token the stylesheet reads', () => {
  it('are the same duration', () => {
    expect(`${TOAST_EXIT_MS}ms`).toBe(motion.durationExit)
  })
})
