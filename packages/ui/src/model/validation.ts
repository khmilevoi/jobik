import type { FlowDocument } from '@jobik/core'
import {
  type Atom,
  action,
  atom,
  type Computed,
  computed,
  sleep,
  withAbort,
  withAsync,
  withComputed,
  wrap,
} from '@reatom/core'
import type { SafeFlowDescriptorPayload } from '#client/index.js'
import type { ValidationFinding } from '#modals/index.js'
import { ACTION_TIMINGS, type ValidateState } from '#primitives/index.js'
import type { TopBarValidateState } from '#shell/index.js'
import { sameFlowShape } from '#studio/draft.js'
import { type FlowProblemModel, NO_PROBLEMS, toFlowProblems } from '#studio/problems.js'
import { toValidationFindings } from '#studio/validation.js'
import { detached } from './reatom.js'
import type { StudioDeps, ValidationModel, ValidationState } from './types.js'

/**
 * `validate()`'s answer, the findings derived from it, and the `3D` chip that reports it.
 *
 * `studio/validation.ts` (the dialog's findings) and `studio/problems.ts` (the strip's rows, the
 * node and port marks, the failing edge) are reused untouched: both were already pure functions of
 * one `WireErrorPayload`, and moving the state off React changes nothing they compute.
 *
 * ## `ValidationState` is not an RTM-A03 violation
 *
 * RTM-A03 objects to a hand-rolled `loading`/`error` pair maintained beside an async unit, which
 * `withAsync` already models. `ValidationState` is a **domain** state with four arms the UI renders
 * differently, and a boolean `.ready()` plus an `.error()` cannot represent it:
 *
 *   - `checking` — the request is out. This one alone overlaps `.ready()`.
 *   - `valid` — carries `checkedAt`, which `3D`'s status strip counts up from.
 *   - `invalid` — carries the server's own `WireErrorPayload`, which every mark on this page is
 *     derived from.
 *   - `unreachable` — the check never *ran*. It is kept apart from `invalid` on purpose: the
 *     `Validation` dialog must not present a transport failure as a finding about the flow.
 *
 * The last two are the point. `client.validate` returns `T | Error` and never rejects, so a
 * rejected document arrives as a **value** and a transport failure arrives as an `Error`; collapsing
 * them into one `.error()` would tell the user the flow is broken when the server is simply down.
 * `_check` still carries `withAsync()` — for `.ready()`, and because RTM-A02 asks a request to be an
 * action rather than hand-rolled scaffolding — but nothing reads its `.error()`.
 */

/**
 * `descriptor` is on the input for the surfaces this model feeds and is read by nothing here: every
 * mark `3D` draws is derived from the document and the one wire finding. It stays on the signature
 * because the contract declares it and `reatomStudio` wires every factory the same way.
 */
export function reatomValidation(
  deps: StudioDeps,
  input: {
    flowId: Atom<string | undefined>
    document: Computed<FlowDocument | undefined>
    descriptor: Computed<SafeFlowDescriptorPayload | undefined>
    locked: Computed<boolean>
  },
  name: string,
): ValidationModel {
  const { flowId, document, locked } = input
  const now = deps.now ?? Date.now

  const state = atom<ValidationState | undefined>(undefined, `${name}.state`)

  /**
   * The document `state` was produced for, captured at the press rather than when the answer lands:
   * an edit made while the request is in flight is exactly the case the result must not survive.
   */
  const validatedFor = atom<FlowDocument | undefined>(undefined, `${name}.validatedFor`)

  /**
   * `3D` — *"errors persist until the flow changes"*, so the result is withheld the moment the flow
   * it describes stops existing. `sameFlowShape` ignores `layout`, so dragging a card does not throw
   * away a report the user is still reading. A derivation, not an effect: no frame shows a stale
   * result.
   */
  const active = computed<ValidationState | undefined>(() => {
    const current = state()
    const producedFor = validatedFor()
    const standing = document()
    if (current === undefined || producedFor === undefined || standing === undefined) return current
    return sameFlowShape(producedFor, standing) ? current : undefined
  }, `${name}.active`)

  /**
   * `3D`, from the one finding the wire carries. Everything the wire cannot say — a second finding,
   * a severity, a source location — is absent rather than invented; `toFlowProblems` is where that
   * honesty lives.
   */
  const problems = computed<FlowProblemModel>(() => {
    const current = active()
    const currentDocument = document()
    if (current?.kind !== 'invalid' || currentDocument === undefined) return NO_PROBLEMS
    return toFlowProblems({ error: current.error, document: currentDocument })
  }, `${name}.problems`)

  const errorCount = computed(
    () => problems().problems.filter((problem) => problem.severity === 'error').length,
    `${name}.errorCount`,
  )

  /**
   * `3D`'s invalid-board caption, which the design states in prose and draws nowhere: *"Run is
   * disabled while any error stands; warnings never block it."* Counted off the findings rather than
   * off `state.kind`, so the day the wire learns to send a warning it will not block a run by
   * accident.
   */
  const blocked = computed(() => errorCount() > 0, `${name}.blocked`)

  const findings = computed<readonly ValidationFinding[] | undefined>(() => {
    const current = active()
    if (current?.kind !== 'invalid') return undefined
    return toValidationFindings({ error: current.error })
  }, `${name}.findings`)

  /** `3D`'s four cells: `Default`, `Validating`, `Valid`, `Invalid`. */
  const chip = atom<ValidateState>('idle', `${name}.chip`)

  /**
   * `3D` §3D.4's `later(4000, …)` — the resolved chip stands `validatedHoldMs`, then the control
   * says `Validate` again. Only the chip returns to idle on it; the findings persist until the flow
   * changes, which `active` owns.
   *
   * **RTM-A05: the hold is `await wrap(sleep(ms))` inside an action extended with `withAbort()`,
   * never a `setTimeout`/`clearTimeout` pair.** That is what makes `reset` able to cancel it without
   * a handle to keep, and it is why nothing in this module owns a timer. The design's other number,
   * `later(1200, …)`, is deliberately absent: that is how the artboard fakes a round trip, and a
   * real check takes however long the server takes — `_check` is what ends the checking phase.
   */
  const _holdChip = action(async (outcome: 'valid' | 'invalid') => {
    chip.set(outcome)
    await wrap(sleep(ACTION_TIMINGS.validatedHoldMs))
    chip.set('idle')
  }, `${name}._holdChip`).extend(withAbort())

  /**
   * The request itself. Both inputs arrive as parameters, read by `validate` before this ever
   * starts, so RTM-A07's hazard — a reactive read placed after the first `await` — cannot arise.
   *
   * `withAbort()` is what `reset` cancels: a flow switch must not let an answer about the flow that
   * was left land on the flow that replaced it.
   */
  const _check = action(async (flow: string, sent: FlowDocument) => {
    // `client.validate` follows the `T | Error` contract and never throws, so an `Error` here is a
    // transport failure rather than a rejected document — the two are kept apart because the dialog
    // says different things about them.
    const result = await wrap(deps.client.validate(flow, sent))
    if (result instanceof Error) {
      state.set({ kind: 'unreachable', message: result.message })
      // The check never ran, so there is no result to hold: the chip goes straight back to idle.
      _holdChip.abort()
      chip.set('idle')
      return
    }
    if (result.valid) {
      state.set({ kind: 'valid', checkedAt: now() })
      detached(_holdChip('valid'))
      return
    }
    state.set({ kind: 'invalid', error: result.error })
    detached(_holdChip('invalid'))
  }, `${name}._check`).extend(withAsync(), withAbort())

  /**
   * §3D.4's own `if (this.state[key] !== 'idle') return`: a press while the check runs, or while a
   * result still stands, does nothing at all. A run in flight refuses it too — the draft lock covers
   * validation, and the top bar draws `Validate` dimmed for the length of a run.
   */
  const validate = action(() => {
    if (locked()) return
    if (chip() !== 'idle') return
    const flow = flowId()
    const sent = document()
    if (flow === undefined || sent === undefined) return
    chip.set('checking')
    validatedFor.set(sent)
    state.set({ kind: 'checking' })
    detached(_check(flow, sent))
  }, `${name}.validate`)

  /**
   * `3C`'s Validation dialog, as a surface of its own rather than as the validation state itself.
   * `3D` makes the findings outlive the dialog — the strip and the canvas marks stand until the flow
   * changes — so dismissing the dialog must not throw the result away.
   *
   * RTM-S02: it opens itself whenever a check rejects the document and closes on every other answer,
   * which is a derivation of `active` rather than an effect; `closeReport` writes over it and the
   * write stands until the next answer.
   */
  const reportOpen = atom(false, `${name}.reportOpen`).extend(
    withComputed(() => active()?.kind === 'invalid'),
  )

  /**
   * The control's cell. `invalid` needs a count, so a state that has lost its findings — the flow
   * changed under the report — falls back to `idle` rather than printing `0 errors`.
   */
  const topBar = computed<TopBarValidateState>((): TopBarValidateState => {
    const cell = chip()
    if (cell !== 'invalid') return { state: cell }
    const count = errorCount()
    return count > 0 ? { state: 'invalid', errorCount: count } : { state: 'idle' }
  }, `${name}.topBar`)

  const dismiss = action(() => {
    state.set(undefined)
    validatedFor.set(undefined)
  }, `${name}.dismiss`)

  /**
   * `openReport` and `closeReport` are named transitions the shortcut layer and three surfaces call,
   * not the identity setters RTM-S01 forbids: the contract puts them on the model precisely so `esc`
   * and the dialog's own dismiss cannot each invent their own way to close it.
   */
  const openReport = action(() => {
    reportOpen.set(true)
  }, `${name}.openReport`)

  const closeReport = action(() => {
    reportOpen.set(false)
  }, `${name}.closeReport`)

  /**
   * What a flow switch calls. The result is dropped **unconditionally**, not through
   * `sameFlowShape`: that comparison exists so a drag does not throw away findings the user is still
   * reading *within one flow*, and a finding about flow `#1` says nothing at all about flow `#2`.
   *
   * Both aborts matter. A check still in flight would otherwise land its answer under the new flow's
   * id, and a chip still holding would return to idle four seconds into a flow that never ran one.
   */
  const reset = action(() => {
    _check.abort()
    _holdChip.abort()
    state.set(undefined)
    validatedFor.set(undefined)
    chip.set('idle')
    reportOpen.set(false)
  }, `${name}.reset`)

  return {
    state,
    validatedFor,
    active,
    problems,
    errorCount,
    blocked,
    findings,
    chip,
    topBar,
    reportOpen,
    validate,
    dismiss,
    openReport,
    closeReport,
    reset,
  }
}
