import { reatomComponent } from '@reatom/react'
import { cx } from '#cx.js'
import type { ValidateState } from '#primitives/actionState.js'
import { CheckIcon } from '#primitives/icons/CheckIcon.js'
import { Spinner } from '#primitives/Spinner/Spinner.js'
import s from './ValidateButton.module.css'

/**
 * Artboard `3D` — `Validate — press, then valid or invalid`.
 *
 * **Why this is a component and not a ninth `Button` cell.** `Button`'s own header says only the
 * cells the artboards draw are typed, and `3A` draws no h30 shape at all — its ladder is
 * 20/22/24/26/32/34, and `3D` labels this row `h 30 · secondary`. Beyond the height, three things
 * here have no `Button` slot: the indeterminate 2 px `jsweep` bar (`Button`'s only absolute child
 * is the *determinate* loader, and it is driven by a percentage this control can never produce),
 * the `report` sub-chip that turns the resolved failure into an opener for the report, and the
 * fact that `min-width:128px` is fixed by the design rather than chosen by the caller the way
 * `reserveWidth` is. Adding a `quiet:h30` cell plus a sweep slot plus a sub-chip slot to `Button`
 * would put three shapes into the shared button system that `3A` does not contain — exactly what
 * that file forbids. `Spinner` and `CheckIcon` are reused rather than redrawn, so nothing is
 * forked: only the box is new.
 *
 * `3D` states the box twice and the two disagree on purpose. §3D.1's matrix gives each state a
 * full tint — border, fill and label — while §3D.2's *live pair* keeps the idle `#232629` border
 * on the shell and puts only the colour on an inner span. This implements the matrix, because the
 * mini top bars of §3D.3 — the two boards that draw the actual Studio — carry the matrix's tinted
 * chip, not the live pair's untinted one. Two readings of three agree, and the two that agree are
 * the ones showing the product.
 *
 * It is presentational: the `idle → checking → valid|invalid → idle` sequence, and the rule that a
 * press outside `idle` is ignored, live in `actionState.ts` beside the copy and download ones.
 */

export type ValidateButtonState = ValidateState

interface ValidateButtonCommonProps {
  readonly onValidate?: () => void
  /** Opens the validation report. `3D` gives the `report` sub-chip and the whole invalid shell to it. */
  readonly onOpenReport?: () => void
  /** `3B` — dims to 45 % and stops responding. The top bar dims it while a run is in flight. */
  readonly dimmed?: boolean
  readonly 'data-testid'?: string
}

/**
 * `errorCount` is required in the invalid state and absent everywhere else, so the label can never
 * be a count nobody supplied. `3D` writes it `2 errors`; the honest form is whatever the findings
 * list actually holds.
 */
export type ValidateButtonProps =
  | (ValidateButtonCommonProps & {
      readonly state?: 'idle' | 'checking' | 'valid'
      readonly errorCount?: undefined
    })
  | (ValidateButtonCommonProps & { readonly state: 'invalid'; readonly errorCount: number })

/** Written out in full so a missing state is a type error and every read is one the gate can see. */
const states = {
  idle: s.stateIdle,
  checking: s.stateChecking,
  valid: s.stateValid,
  invalid: s.stateInvalid,
} satisfies Record<ValidateButtonState, string>

/** `07-copy.md` §12, as extended by `3D`: singular at one, plural otherwise. */
export function errorCountLabel(count: number): string {
  return count === 1 ? '1 error' : `${count} errors`
}

export const ValidateButton = reatomComponent(function ValidateButton(props: ValidateButtonProps) {
  const state = props.state ?? 'idle'
  const dimmed = props.dimmed === true
  const invalid = state === 'invalid'

  return (
    <button
      type="button"
      // `Default` and `Invalid` carry `cursor:pointer`; `Validating` and `Valid` do not, and a
      // press in either is ignored by the sequence anyway — so the two are disabled outright.
      disabled={dimmed || state === 'checking' || state === 'valid'}
      onClick={invalid ? props.onOpenReport : props.onValidate}
      data-testid={props['data-testid']}
      className={cx(s.validate, states[state], dimmed && s.dimmed)}
    >
      {state === 'checking' ? (
        <>
          {/*
           * `4A:198`'s "90 ms swap in". The sweep stays outside the swap: it is pinned to the
           * shell's bottom edge and is a loop of its own, not part of the contents that fade.
           */}
          <span key={state} className={s.swap}>
            <Spinner size={11} data-testid="validate-spinner" />
            <span className={s.label}>Validating</span>
          </span>
          {/* The 2 px indeterminate sweep, pinned to the bottom of the overflow-hidden shell. */}
          <span aria-hidden="true" data-testid="validate-sweep" className={s.sweep} />
        </>
      ) : null}
      {state === 'valid' ? (
        <>
          <CheckIcon size={11} data-testid="validate-check" />
          <span className={s.label}>Valid</span>
        </>
      ) : null}
      {props.state === 'invalid' ? (
        <>
          <span className={s.label}>{errorCountLabel(props.errorCount)}</span>
          <span data-testid="validate-report" className={s.report}>
            report
          </span>
        </>
      ) : null}
      {/*
       * `4A:198`'s "90 ms swap out" — the return to `Validate` after the 4 s hold. `valid` and
       * `invalid` are not wrapped: `3D:665-666` gives the resolved cells `jpop` instead, and the
       * button's own `animation-name` changing is enough to replay that one.
       */}
      {state === 'idle' ? (
        <span key={state} className={s.swap}>
          <span className={s.label}>Validate</span>
        </span>
      ) : null}
    </button>
  )
}, 'ValidateButton')
