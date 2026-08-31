import { useEffect, useState } from 'react'

/**
 * The copy and download sequences, headless — the timing half of artboard `3A`, in one place, so
 * the modal, the output dock, the run panel and the canvas cannot each invent their own.
 *
 * `08-buttons.md` §4.1 carries the artboard's own script verbatim and is the authoritative
 * statement of both sequences. What it fixes, and what is reproduced here:
 *
 *   - **Copy** is synchronous. It swaps straight to `ok`, holds `1600 ms` and returns to `idle`.
 *     There is no `working` state in the live logic at all — rule 01 makes the spinner an
 *     exception for serialisation that runs past `400 ms`, not the normal path. That is why
 *     `copy()` arms the spinner on a timer and usually cancels it before it ever fires.
 *   - **Download** runs `idle → busy → progress → ok → idle`, holding `ok` for `1800 ms`. The
 *     artboard's `700 ms` prepare and its `+7 %` every `110 ms` are how the *artboard* fakes a
 *     transfer; a real one is driven by bytes, so `start`, `advance` and `finish` are the caller's
 *     to call and only the closing hold is on a timer here.
 *   - Pressing again mid-sequence is a no-op in both — the script returns early. Copy is the one
 *     exception this module makes deliberate rather than accidental: a press while `failed`
 *     **does** retry, because `3A` §2.5 labels that cell `Copy failed — retry`.
 *   - The design draws no failed cell for a download, so there is none here. A caller whose
 *     download fails calls `reset()`; inventing a fifth state would be inventing chrome.
 *
 * Errors arrive as values, per the repository's `errore` convention: a `CopyWrite` returns an
 * `Error` rather than throwing one. A rejected promise is still handled — `navigator.clipboard`
 * rejects — but it is handled as a failure signal, not turned into a new error type.
 */

export const ACTION_TIMINGS = {
  /** `3A` rule 01 — the spinner appears only if serialising runs past this. */
  copySpinnerDelayMs: 400,
  /** `3A` sub-label, and §4.1's `later(1600, …)` — `copied holds 1.6 s`. */
  copiedHoldMs: 1600,
  /** `3A` §4.1's `later(1800, …)` — how long `saved` holds before returning to idle. */
  savedHoldMs: 1800,
  /**
   * `3D` sub-label — `result chip holds 4 s` — and §3D.4's `later(4000, …)`. How long the
   * resolved `Valid` / `<n> errors` chip stands before the control says `Validate` again.
   *
   * The artboard's other number, `later(1200, …)`, is deliberately **not** here: that is how the
   * design fakes a round trip, and a real check takes however long the server takes. `settle()`
   * is what ends the checking phase.
   */
  validatedHoldMs: 4000,
} as const

export type CopyState = 'idle' | 'busy' | 'ok' | 'failed'
export type DownloadState = 'idle' | 'busy' | 'progress' | 'ok'

/** `3D`'s four cells: `Default`, `Validating`, `Valid`, `Invalid`. */
export type ValidateState = 'idle' | 'checking' | 'valid' | 'invalid'

/**
 * The work a copy does. Returning an `Error` is the failure path; so is a rejected promise, for
 * the browser APIs that only speak that way.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: `void` is the success arm — narrowing it to `undefined` makes `copy(() => { … })` a type error, since an arrow that returns nothing is typed `void`.
export type CopyWrite = () => void | Error | Promise<void | Error>

export interface CopyAction {
  readonly state: CopyState
  /** No-op while `busy` or `ok`. Runs from `idle` and, deliberately, from `failed`. */
  copy(write: CopyWrite): Promise<void>
  /** Back to `idle`, cancelling any pending swap. */
  reset(): void
  /** Cancels pending timers. The action stays usable afterwards. */
  dispose(): void
}

export interface DownloadAction {
  readonly state: DownloadState
  /** `0`–`100` while transferring, `undefined` in every other state — the design's bar is 0% there. */
  readonly progress: number | undefined
  /** Begins the indeterminate phase. No-op unless idle. */
  start(): void
  /** Moves to the determinate phase and reports how far along it is. */
  advance(percent: number): void
  /** Lands on `ok`, then returns to `idle` after `savedHoldMs`. */
  finish(): void
  reset(): void
  dispose(): void
}

export interface ValidateAction {
  readonly state: ValidateState
  /**
   * The design's `if (this.state[key] !== 'idle') return` — a press while the check is running or
   * while a result still stands does nothing. Returns whether the press was accepted, so the
   * caller knows whether to actually issue the request.
   */
  press(): boolean
  /** Ends the checking phase with the check's own outcome. Ignored unless a check is running. */
  settle(outcome: 'valid' | 'invalid'): void
  /** Back to `idle`, cancelling the hold. What a flow change calls. */
  reset(): void
  dispose(): void
}

type Timer = ReturnType<typeof setTimeout>

/**
 * `3D` §3D.4, headless: `idle → checking → valid|invalid → idle`, with the resolved chip holding
 * `validatedHoldMs` and every press outside `idle` ignored.
 *
 * The middle transition is the caller's — a real validation takes as long as the server takes —
 * so the only timer here is the closing hold, exactly as `createDownloadAction` keeps only its own.
 */
export function createValidateAction(onChange: (state: ValidateState) => void): ValidateAction {
  let state: ValidateState = 'idle'
  let hold: Timer | undefined

  const set = (next: ValidateState) => {
    state = next
    onChange(next)
  }

  const clearTimers = () => {
    if (hold !== undefined) clearTimeout(hold)
    hold = undefined
  }

  return {
    get state() {
      return state
    },

    press() {
      if (state !== 'idle') return false
      clearTimers()
      set('checking')
      return true
    },

    settle(outcome: 'valid' | 'invalid') {
      if (state !== 'checking') return
      clearTimers()
      set(outcome)
      hold = setTimeout(() => {
        hold = undefined
        set('idle')
      }, ACTION_TIMINGS.validatedHoldMs)
    },

    reset() {
      clearTimers()
      set('idle')
    },

    dispose() {
      clearTimers()
    },
  }
}

export function createCopyAction(onChange: (state: CopyState) => void): CopyAction {
  let state: CopyState = 'idle'
  let spinner: Timer | undefined
  let hold: Timer | undefined

  const set = (next: CopyState) => {
    state = next
    onChange(next)
  }

  const clearTimers = () => {
    if (spinner !== undefined) clearTimeout(spinner)
    if (hold !== undefined) clearTimeout(hold)
    spinner = undefined
    hold = undefined
  }

  return {
    get state() {
      return state
    },

    async copy(write: CopyWrite) {
      if (state === 'busy' || state === 'ok') return
      clearTimers()
      // Armed, not shown: a synchronous clipboard write cancels this long before it fires, which
      // is exactly rule 01 — the spinner is what a slow serialisation looks like, not a copy.
      spinner = setTimeout(() => {
        spinner = undefined
        set('busy')
      }, ACTION_TIMINGS.copySpinnerDelayMs)

      let failed = false
      try {
        const result = await write()
        failed = result instanceof Error
      } catch {
        failed = true
      }

      if (spinner !== undefined) {
        clearTimeout(spinner)
        spinner = undefined
      }
      if (failed) {
        // Terminal until the next press. `3A` draws no timed exit from the failed cell, and its
        // panel-button label — `Copy failed — retry` — says what does clear it.
        set('failed')
        return
      }
      set('ok')
      hold = setTimeout(() => {
        hold = undefined
        set('idle')
      }, ACTION_TIMINGS.copiedHoldMs)
    },

    reset() {
      clearTimers()
      set('idle')
    },

    dispose() {
      clearTimers()
    },
  }
}

export function createDownloadAction(
  onChange: (state: DownloadState, progress: number | undefined) => void,
): DownloadAction {
  let state: DownloadState = 'idle'
  let progress: number | undefined
  let hold: Timer | undefined

  const set = (nextState: DownloadState, nextProgress: number | undefined) => {
    state = nextState
    progress = nextProgress
    onChange(nextState, nextProgress)
  }

  const clearTimers = () => {
    if (hold !== undefined) clearTimeout(hold)
    hold = undefined
  }

  return {
    get state() {
      return state
    },
    get progress() {
      return progress
    },

    start() {
      if (state !== 'idle') return
      clearTimers()
      set('busy', undefined)
    },

    advance(percent: number) {
      if (state !== 'busy' && state !== 'progress') return
      set('progress', Math.min(100, Math.max(0, percent)))
    },

    finish() {
      if (state === 'idle' || state === 'ok') return
      clearTimers()
      // `dlWidth = (dl === 'prog' ? dlPct : 0) + '%'` — the bar does not linger full through the
      // hold, so the percentage goes away with the transferring state.
      set('ok', undefined)
      hold = setTimeout(() => {
        hold = undefined
        set('idle', undefined)
      }, ACTION_TIMINGS.savedHoldMs)
    },

    reset() {
      clearTimers()
      set('idle', undefined)
    },

    dispose() {
      clearTimers()
    },
  }
}

/**
 * The copy sequence as a hook, for the common case.
 *
 * The action is created once by `useState`'s initializer and its timers are cancelled on unmount,
 * so a component that leaves the tree mid-hold never calls `setState` afterwards. `dispose` only
 * cancels — the action stays usable — which is what makes it safe under StrictMode's
 * mount/unmount/remount.
 */
export function useCopyAction(): {
  readonly state: CopyState
  readonly copy: (write: CopyWrite) => Promise<void>
  readonly reset: () => void
} {
  const [state, setState] = useState<CopyState>('idle')
  const [action] = useState(() => createCopyAction(setState))
  useEffect(() => () => action.dispose(), [action])
  return { state, copy: action.copy, reset: action.reset }
}

/**
 * The validate sequence as a hook. `settle` is driven by the server's own answer, never by a timer.
 *
 * Created once by `useState`'s initializer and disposed on unmount, so a component that leaves the
 * tree mid-hold never calls `setState` afterwards — the same shape `useCopyAction` has, and safe
 * under StrictMode for the same reason: `dispose` only cancels.
 */
export function useValidateAction(): {
  readonly state: ValidateState
  readonly press: () => boolean
  readonly settle: (outcome: 'valid' | 'invalid') => void
  readonly reset: () => void
} {
  const [state, setState] = useState<ValidateState>('idle')
  const [action] = useState(() => createValidateAction(setState))
  useEffect(() => () => action.dispose(), [action])
  return { state, press: action.press, settle: action.settle, reset: action.reset }
}

/** The download sequence as a hook. `start`, `advance` and `finish` are driven by real bytes. */
export function useDownloadAction(): {
  readonly state: DownloadState
  readonly progress: number | undefined
  readonly start: () => void
  readonly advance: (percent: number) => void
  readonly finish: () => void
  readonly reset: () => void
} {
  const [current, setCurrent] = useState<{
    state: DownloadState
    progress: number | undefined
  }>({ state: 'idle', progress: undefined })
  const [action] = useState(() =>
    createDownloadAction((state, progress) => setCurrent({ state, progress })),
  )
  useEffect(() => () => action.dispose(), [action])
  return {
    state: current.state,
    progress: current.progress,
    start: action.start,
    advance: action.advance,
    finish: action.finish,
    reset: action.reset,
  }
}
