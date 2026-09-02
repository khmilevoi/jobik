import { type Atom, atom, context, wrap } from '@reatom/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobikClient, WireRunReportPayload } from '#client/index.js'
import type { RunSession } from '#studio/runSession.js'
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
    elapse: (ms: number) => wrap(vi.advanceTimersByTimeAsync(ms)),
    disconnect: () => {
      for (const unsubscribe of unsubscribes) unsubscribe()
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
   * `RunModel.history` collapses `cancelled` into `failed`, because `2A`'s rows draw two tones. A
   * toast built on that would tell the user a run they cancelled had failed, so this model reads
   * the archive's own reports instead.
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

  it('raises nothing when a flow switch empties the archive', async () => {
    await withToast(async ({ toast, archive, settle, elapse }) => {
      await settle(REPORT)
      await elapse(TOAST_HOLD_MS + TOAST_EXIT_MS)
      expect(toast.message()).toBeUndefined()

      archive.set([])
      await elapse(0)

      expect(toast.message()).toBeUndefined()
    })
  })

  it('takes the toast away on dismiss', async () => {
    await withToast(async ({ toast, settle }) => {
      await settle(REPORT)

      toast.dismiss()

      expect(toast.message()).toBeUndefined()
      expect(toast.visible()).toBe(false)
    })
  })
})
