import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACTION_TIMINGS, createValidateAction, type ValidateState } from './actionState.js'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/**
 * The one sequence this module still performs, tested against the clock rather than against the
 * DOM. `createCopyAction` and `createDownloadAction` went with `output/OutputHeader`'s hooks: what
 * their cases stated is stated by `model/output.test.ts`'s `` `3A` — Copy all `` and
 * `` `3A` — Download `` blocks, case name for case name, against the sequences the model actually
 * runs.
 *
 * What is left is `3D` §3D.4's own script, minus the fake round trip. The artboard's
 * `later(1200, …)` is how the design pretends to reach a server; here the caller settles the check,
 * so the only clock this module owns is the 4 s hold on the resolved chip.
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
