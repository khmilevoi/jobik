/**
 * `3A`'s copy and download cells and `3D`'s validate ones, with the timings the artboards fix —
 * stated once, so the modal, the output dock, the run panel and the canvas cannot each invent their
 * own. The sequences those cells belong to are performed elsewhere; this is the vocabulary.
 *
 * ## Where the three sequences actually run, as of the Reatom wave
 *
 * All three of them are **performed by the model**, and this file is where the design's numbers and
 * cells are stated rather than where the machines live:
 *
 *   - **copy** and **download** — `model/output.ts`, as `copyState`/`downloadState` plus `copyAll`,
 *     `download` and their private holds. The dock's two buttons act on the run report, so the
 *     sequence belongs where the report is.
 *   - **validate** — `model/validation.ts`, as `chip` plus `_holdChip`. `3D`'s chip reports an
 *     answer about the flow document, so the same argument applies.
 *
 * Every one of those holds is `await wrap(sleep(ms))` inside an action extended with `withAbort()`
 * (RTM-A05), which is what lets a flow switch cancel a hold with no handle to keep. **There is
 * deliberately no `reatomCopyAction` / `reatomDownloadAction` / `reatomValidateAction` factory
 * here.** Such a factory would have exactly one possible consumer each, and each of those consumers
 * already has a better-documented implementation on the model; a second copy of a machine is not an
 * abstraction. Every other `Copy` in the Studio — the validation dialog's, the stack trace's, the
 * failed run's log, the conflict chip's draft — is a bare `onClick` with no state matrix at all.
 *
 * The imperative half is **gone**. `output/OutputHeader` was its last caller, and now that the
 * header reads `OutputActionsModel.copyState`/`downloadState` and presses `OutputModel.copyAll`/
 * `download`, `CopyAction`, `DownloadAction`, `createCopyAction`, `createDownloadAction`,
 * `useCopyAction` and `useDownloadAction` have gone with it, and `react` is no longer an import of
 * this module. What every one of them stated is stated by `model/output.ts` and asserted by
 * `model/output.test.ts` under the same case names, with two exceptions worth recording because
 * they were rules about the factories rather than about the design: a `CopyWrite` that *returns* an
 * `Error` (the model performs the clipboard write itself, and `output/OutputHeader.test.tsx` states
 * the refusal it can actually meet), and `advance`'s determinate download phase, which nothing has
 * ever been able to drive — see `progress` below. `ACTION_TIMINGS`, `CopyState`, `DownloadState`,
 * `ValidateState` and `CopyWrite` stay: those are what the model imports from here.
 *
 * `08-buttons.md` §4.1 carries the artboard's own script verbatim and is the authoritative
 * statement of both sequences. What it fixes, and what is reproduced here:
 *
 *   - **Copy** is synchronous. It swaps straight to `ok`, holds `1600 ms` and returns to `idle`.
 *     There is no `working` state in the live logic at all — rule 01 makes the spinner an
 *     exception for serialisation that runs past `400 ms`, not the normal path, which is why
 *     `model/output.ts` arms that spinner and aborts it before it can land.
 *   - **Download** runs `idle → busy → progress → ok → idle`, holding `ok` for `1800 ms`. The
 *     artboard's `700 ms` prepare and its `+7 %` every `110 ms` are how the *artboard* fakes a
 *     transfer; a real one would be driven by bytes, and no byte count reaches this client, so the
 *     model never enters `progress` at all.
 *   - Pressing again mid-sequence is a no-op in both — the script returns early. Copy is the one
 *     exception the design makes deliberate rather than accidental: a press while `failed`
 *     **does** retry, because `3A` §2.5 labels that cell `Copy failed — retry`.
 *   - The design draws no failed cell for a download, so there is none here. A download that could
 *     not be written returns to `idle`; inventing a fifth state would be inventing chrome.
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

/**
 * `3A` §3's four download cells.
 *
 * `progress` — the determinate branch — is drawable (`Button` takes a percentage and paints the
 * bar) and **unreachable**: nothing on the wire carries a byte count, so `model/output.ts` goes
 * `idle → busy → ok → idle` and rule 03's own words are what say that is correct. The arm stays so
 * that every label map remains exhaustive, and so that a transfer that one day reports its size has
 * a cell to enter.
 */
export type DownloadState = 'idle' | 'busy' | 'progress' | 'ok'

/** `3D`'s four cells: `Default`, `Validating`, `Valid`, `Invalid`. */
export type ValidateState = 'idle' | 'checking' | 'valid' | 'invalid'

/**
 * The work a copy does. Returning an `Error` is the failure path; so is a rejected promise, for
 * the browser APIs that only speak that way.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: `void` is the success arm — narrowing it to `undefined` makes `copy(() => { … })` a type error, since an arrow that returns nothing is typed `void`.
export type CopyWrite = () => void | Error | Promise<void | Error>

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
 * so the only timer here is the closing hold.
 *
 * **Nothing in the Studio calls this any more** — `model/validation.ts`'s `chip` is what `3D` reads,
 * and `model/validation.test.ts` re-asserts four of the six cases below under their own names. It is
 * kept because the other two are the executable statement of rules the model has no way to reach:
 * an outcome that no press asked for cannot arise there (only `validate` can start `_check`), and
 * there is no `dispose` to cancel a hold with — `reset` is that, and it also returns to idle. Delete
 * this and `actionState.test.ts`'s `createValidateAction` block together, or not at all.
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
