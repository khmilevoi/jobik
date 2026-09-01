import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useModalExit } from './modalExit.js'

afterEach(cleanup)

/**
 * The lifecycle `4A`'s `120 ms` out phase needs and the dialogs did not have: an element that
 * survives the state write that dismissed it, for exactly as long as its own departure lasts.
 *
 * How long that is belongs to `ModalShell`, which measures it off the card; this file is about what
 * is drawn in the meantime and what ends it.
 */
describe('useModalExit', () => {
  it('hands the live view straight back while the model is open', () => {
    const { result } = renderHook((view: string | undefined) => useModalExit(view), {
      initialProps: 'first' as string | undefined,
    })

    expect(result.current?.view).toBe('first')
    expect(result.current?.leaving).toBe(false)
  })

  it('holds the last committed view once the model closes, and drops it on onExited', () => {
    const { result, rerender } = renderHook((view: string | undefined) => useModalExit(view), {
      initialProps: 'first' as string | undefined,
    })

    rerender(undefined)

    // The model has nothing left to read; what the user was looking at is still on screen.
    expect(result.current?.view).toBe('first')
    expect(result.current?.leaving).toBe(true)

    act(() => {
      result.current?.onExited()
    })

    expect(result.current).toBeUndefined()
  })

  it('reopens on a new view, including one that arrives mid-departure', () => {
    const { result, rerender } = renderHook((view: string | undefined) => useModalExit(view), {
      initialProps: 'first' as string | undefined,
    })

    rerender(undefined)
    expect(result.current?.leaving).toBe(true)

    // A dialog reopened before its exit finished is open again, not still leaving.
    rerender('second')
    expect(result.current?.view).toBe('second')
    expect(result.current?.leaving).toBe(false)

    // And the completed exit that follows holds the newer view, not the older one.
    rerender(undefined)
    expect(result.current?.view).toBe('second')
    act(() => {
      result.current?.onExited()
    })
    expect(result.current).toBeUndefined()
  })

  it('draws nothing when it has never been given a view', () => {
    const { result } = renderHook((view: string | undefined) => useModalExit(view), {
      initialProps: undefined as string | undefined,
    })

    expect(result.current).toBeUndefined()
  })
})
