import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACTION_TIMINGS,
  type CopyState,
  createCopyAction,
  createDownloadAction,
  createValidateAction,
  type DownloadState,
  type ValidateState,
} from './actionState.js'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * The two sequences `3A` §4.1 states in JavaScript, tested against the clock rather than against
 * the DOM. Nothing here renders: the whole point of the module is that the timing is one thing
 * four components share, so the timing is what is asserted.
 */
describe('createCopyAction', () => {
  it('swaps straight to copied, with no spinner, when the write is synchronous', async () => {
    const seen: CopyState[] = []
    const action = createCopyAction((state) => seen.push(state))

    await action.copy(() => {})

    // Rule 01: clipboard writes are synchronous, so `busy` is never reached — the 400 ms timer is
    // armed and cancelled before it can fire.
    expect(seen).toEqual(['ok'])
    expect(action.state).toBe('ok')
  })

  it('holds copied for exactly 1.6 s, then returns to idle', async () => {
    const action = createCopyAction(() => {})
    await action.copy(() => {})

    vi.advanceTimersByTime(ACTION_TIMINGS.copiedHoldMs - 1)
    expect(action.state).toBe('ok')

    vi.advanceTimersByTime(1)
    expect(action.state).toBe('idle')
  })

  it('shows the spinner only once serialising has run past 400 ms', async () => {
    let settle: (() => void) | undefined
    const pending = new Promise<void>((resolve) => {
      settle = resolve
    })
    const action = createCopyAction(() => {})

    const running = action.copy(() => pending)

    await vi.advanceTimersByTimeAsync(ACTION_TIMINGS.copySpinnerDelayMs - 1)
    expect(action.state).toBe('idle')

    await vi.advanceTimersByTimeAsync(1)
    expect(action.state).toBe('busy')

    settle?.()
    await running
    expect(action.state).toBe('ok')
  })

  it('ignores a second press while the first is still holding', async () => {
    const action = createCopyAction(() => {})
    const write = vi.fn(() => {})

    await action.copy(write)
    await action.copy(write)

    expect(write).toHaveBeenCalledTimes(1)
  })

  /** An `Error` returned is the failure path — the repository's convention, not a thrown one. */
  it('lands on failed when the write returns an Error, and stays there', async () => {
    const action = createCopyAction(() => {})

    await action.copy(() => new Error('clipboard blocked by the browser'))
    expect(action.state).toBe('failed')

    vi.advanceTimersByTime(ACTION_TIMINGS.copiedHoldMs * 2)
    expect(action.state).toBe('failed')
  })

  it('treats a rejected promise as the same failure, for the APIs that only reject', async () => {
    const action = createCopyAction(() => {})
    await action.copy(() => Promise.reject(new Error('denied')))
    expect(action.state).toBe('failed')
  })

  /** `3A` §2.5 labels the failed panel button `Copy failed — retry`, so a press must retry. */
  it('retries from failed', async () => {
    const action = createCopyAction(() => {})
    await action.copy(() => new Error('blocked'))

    const retry = vi.fn(() => {})
    await action.copy(retry)

    expect(retry).toHaveBeenCalledTimes(1)
    expect(action.state).toBe('ok')
  })

  it('stops touching the clock once disposed', async () => {
    const action = createCopyAction(() => {})
    await action.copy(() => {})

    action.dispose()
    vi.advanceTimersByTime(ACTION_TIMINGS.copiedHoldMs * 2)

    expect(action.state).toBe('ok')
  })
})

describe('createDownloadAction', () => {
  it('runs idle -> busy -> progress -> ok -> idle', () => {
    const seen: DownloadState[] = []
    const action = createDownloadAction((state) => seen.push(state))

    action.start()
    expect(action.state).toBe('busy')
    // Rule 03: no percentage until a size is known, so the indeterminate phase reports none.
    expect(action.progress).toBeUndefined()

    action.advance(42)
    expect(action.state).toBe('progress')
    expect(action.progress).toBe(42)

    action.finish()
    expect(action.state).toBe('ok')
    // `dlWidth` is `0%` in every state but `prog`, so the bar does not linger full.
    expect(action.progress).toBeUndefined()

    vi.advanceTimersByTime(ACTION_TIMINGS.savedHoldMs)
    expect(action.state).toBe('idle')
    expect(seen).toEqual(['busy', 'progress', 'ok', 'idle'])
  })

  it('ignores a press while a download is already running', () => {
    const onChange = vi.fn()
    const action = createDownloadAction(onChange)

    action.start()
    action.advance(42)
    onChange.mockClear()

    action.start()
    expect(onChange).not.toHaveBeenCalled()
    expect(action.progress).toBe(42)
  })

  it('clamps a percentage to the range the bar can draw', () => {
    const action = createDownloadAction(() => {})
    action.start()

    action.advance(140)
    expect(action.progress).toBe(100)

    action.advance(-10)
    expect(action.progress).toBe(0)
  })

  it('goes back to idle on reset, which is the only exit a failed download has', () => {
    const action = createDownloadAction(() => {})
    action.start()
    action.advance(42)

    action.reset()

    expect(action.state).toBe('idle')
    expect(action.progress).toBeUndefined()
  })
})

/**
 * `3D` §3D.4's own script, minus the fake round trip. The artboard's `later(1200, …)` is how the
 * design pretends to reach a server; here the caller settles the check, so the only clock this
 * module owns is the 4 s hold on the resolved chip.
 */
describe('createValidateAction', () => {
  it('runs idle -> checking -> valid and holds the chip for exactly 4 s', () => {
    const seen: ValidateState[] = []
    const action = createValidateAction((state) => seen.push(state))

    expect(action.press()).toBe(true)
    action.settle('valid')
    expect(seen).toEqual(['checking', 'valid'])

    vi.advanceTimersByTime(ACTION_TIMINGS.validatedHoldMs - 1)
    expect(action.state).toBe('valid')

    vi.advanceTimersByTime(1)
    expect(action.state).toBe('idle')
    expect(seen).toEqual(['checking', 'valid', 'idle'])
  })

  it('holds the invalid chip for the same 4 s', () => {
    const action = createValidateAction(() => {})
    action.press()
    action.settle('invalid')

    expect(action.state).toBe('invalid')
    vi.advanceTimersByTime(ACTION_TIMINGS.validatedHoldMs)
    expect(action.state).toBe('idle')
  })

  it('ignores a press while the check runs and while a result still stands', () => {
    const action = createValidateAction(() => {})

    action.press()
    expect(action.press()).toBe(false)

    action.settle('invalid')
    expect(action.press()).toBe(false)
    expect(action.state).toBe('invalid')

    // Only once the hold has expired does the control take a press again.
    vi.advanceTimersByTime(ACTION_TIMINGS.validatedHoldMs)
    expect(action.press()).toBe(true)
    expect(action.state).toBe('checking')
  })

  it('ignores an outcome that no press asked for', () => {
    const onChange = vi.fn()
    const action = createValidateAction(onChange)

    action.settle('valid')

    expect(action.state).toBe('idle')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('drops the result the moment the flow changes', () => {
    const action = createValidateAction(() => {})
    action.press()
    action.settle('invalid')

    action.reset()

    expect(action.state).toBe('idle')
    // The hold that was still running must not put the chip back afterwards.
    vi.advanceTimersByTime(ACTION_TIMINGS.validatedHoldMs)
    expect(action.state).toBe('idle')
  })

  it('cancels its hold on dispose and stays usable', () => {
    const onChange = vi.fn()
    const action = createValidateAction(onChange)
    action.press()
    action.settle('valid')
    onChange.mockClear()

    action.dispose()
    vi.advanceTimersByTime(ACTION_TIMINGS.validatedHoldMs)

    expect(onChange).not.toHaveBeenCalled()
    expect(action.state).toBe('valid')
  })
})
