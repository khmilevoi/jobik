import { reatomComponent, useAction } from '@reatom/react'
import { cx } from '#cx.js'
import { ModalShell } from '#modals/ModalShell/ModalShell.js'
import { type ProseSegment, ProseText } from '#modals/ProseText/ProseText.js'
import { useStudioModel } from '#model/context.js'
import { CopyIcon } from '#primitives/icons/CopyIcon.js'
import { Button, type CopyState } from '#primitives/index.js'
import s from './ValidationModal.module.css'

/** §2 — the two tones a finding is drawn in. The design draws no third. */
export type ValidationSeverity = 'error' | 'warning'

/** §2 — `Reveal node` is the accent action, `Open in editor` the muted one. */
export type ValidationActionTone = 'accent' | 'muted'

export interface ValidationAction {
  /** Verbatim — `Reveal node`, `Open in editor`. */
  readonly label: string
  readonly tone: ValidationActionTone
  readonly onSelect?: () => void
}

export interface ValidationFinding {
  readonly severity: ValidationSeverity
  /** The error class, mono and PascalCase — `TypeMismatch`, `UnconnectedInput`, `UnusedOutput`. */
  readonly code: string
  /** The source reference at the right of the tag row — `flow.ts:41`. */
  readonly source?: string
  /** The sentence, with its identifiers marked mono — see `ProseSegment`. */
  readonly message: readonly ProseSegment[]
  /** A warning has none: §2, *"A warning has no action links."* */
  readonly actions?: readonly ValidationAction[]
}

/** Written out in full so a missing severity is a type error and every read is visible to the gate. */
const findingTones = {
  error: s.findingError,
  warning: s.findingWarning,
} satisfies Record<ValidationSeverity, string>

const codeTones = {
  error: s.codeError,
  warning: s.codeWarning,
} satisfies Record<ValidationSeverity, string>

const sourceTones = {
  error: s.sourceError,
  warning: s.sourceWarning,
} satisfies Record<ValidationSeverity, string>

const messageTones = {
  error: s.messageError,
  warning: s.messageWarning,
} satisfies Record<ValidationSeverity, string>

const actionTones = {
  accent: s.actionAccent,
  muted: s.actionMuted,
} satisfies Record<ValidationActionTone, string>

/**
 * `3A` §2.1's four cells, with `3C` §2's own noun. The idle label is the artboard's `Copy report`;
 * the other three are `3A`'s, verbatim.
 */
const COPY_LABELS = {
  idle: 'Copy report',
  busy: 'Copying',
  ok: 'Copied',
  failed: 'Copy failed',
} satisfies Record<CopyState, string>

/** `2 errors`, `1 warning` — the badge text is a count, so it pluralises with the count. */
function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/**
 * `3C` Modal A — **Validation**, `560px`. `09-modals.md` §2.
 *
 * The findings list is the body, one card per finding, and it is the part that scrolls. Error and
 * warning differ on the whole ramp — border, ground, class tag, source ref and message all step
 * down one level — which is why every one of them is a variant pair rather than a single class
 * plus a colour override.
 *
 * The header's count badges are derived from `findings` rather than passed in: the design's `2
 * errors` / `1 warning` are exactly the counts of the three findings it draws, and a badge that
 * could disagree with the list under it would be a second source of truth. A count of zero draws
 * no badge.
 *
 * ## It reads the model, and the wire is narrower than the artboard
 *
 * It takes no props: `ValidationModel.reportOpen` is whether it stands, `reportFindings` is the
 * list, `flows.descriptor` builds the `publication · flow.ts` context line, `revalidate` is
 * `Re-validate`, `copyReport` is `Copy report` and `closeReport` is every dismissal. The guard is
 * here rather than in `StudioApp` for the reason `CancelRunModal`'s is — RTM-C01 means a shut
 * dialog subscribes to `reportOpen` and reads nothing else.
 *
 * **`revalidate`, not `validate`, and `reportFindings`, not `findings`.** Both differences are
 * rule 04 — *"the modal stays open until the work settles"*. `validate` carries `3D`'s
 * four-second chip hold, which is the top bar's rule and made this button a no-op for exactly the
 * window in which it is pressed; and `findings` empties the moment a re-check starts, which would
 * have unmounted the dialog under the loader it just lit. See `model/validation.ts`.
 *
 * **What the model can produce is one finding, and the artboard draws three.**
 * `ValidationModel.findings` runs `studio/validation.ts`'s `toValidationFindings`, which is honest
 * about v1's wire: `POST /api/flows/:id/validate` answers with **one** `WireErrorPayload` carrying
 * no severity, no source location and no second entry, so every finding reaching this component is
 * a lone `severity: 'error'` with no `source` and — because the model passes no `onRevealNode` — no
 * action links. `3C` fixes a list of three across two severities with `flow.ts:41` refs and
 * `Reveal node` / `Open in editor` links, so the warning ramp, the source cell, the action row and
 * the `2 errors · 1 warning` header pair below are **drawn but unexercised** until the endpoint is
 * widened. They are kept rather than deleted: the day the wire carries a second finding, nothing
 * here changes. The cases that used to assert them through props were removed with the props.
 *
 * `Copy report` now has the unit it was missing. What it writes is the list this component draws
 * and nothing else — a code and the server's own sentence per row — so the clipboard cannot claim
 * a severity or a source location the wire never sent. It runs `3A` §4.1's matrix, the same one
 * the output dock's copy runs.
 */
export const ValidationModal = reatomComponent(function ValidationModal() {
  const { flows, validation } = useStudioModel()

  // RTM-C02: both are pressed from a DOM event, outside this render's frame. They are declared
  // above the guards because they are hooks, and they read no atom, so hoisting them costs the
  // lazy-read discipline below nothing.
  const revalidate = useAction(validation.revalidate)
  const copyReport = useAction(validation.copyReport)
  const dismiss = useAction(validation.closeReport)

  // RTM-C01: the guards first, and every value the body draws only after them.
  if (!validation.reportOpen()) return null
  const findings = validation.reportFindings()
  if (findings === undefined) return null

  const checking = validation.active()?.kind === 'checking'
  const copyCell = validation.copyState()

  // §1.3 draws the context as `name · file`, and draws no state in which it is missing. A
  // descriptor that has not resolved yet has neither half, so the slot is omitted rather than
  // degraded to the separator between two empty strings.
  const descriptor = flows.descriptor()
  const context =
    descriptor === undefined ? undefined : `${descriptor.name} · ${descriptor.sourceFile}`
  const errors = findings.filter((finding) => finding.severity === 'error').length
  const warnings = findings.length - errors

  const badges = (
    <>
      {errors === 0 ? null : (
        <div data-testid="validation-error-count" className={cx(s.badge, s.badgeError)}>
          {countLabel(errors, 'error')}
        </div>
      )}
      {warnings === 0 ? null : (
        <div data-testid="validation-warning-count" className={cx(s.badge, s.badgeWarning)}>
          {countLabel(warnings, 'warning')}
        </div>
      )}
    </>
  )

  const actions = (
    <>
      <Button
        variant="quiet"
        size="modal"
        state={copyCell}
        icon={<CopyIcon />}
        reserveWidth={118}
        onClick={copyReport}
        data-testid="validation-copy-report"
      >
        {COPY_LABELS[copyCell]}
      </Button>
      {/*
        Rule 04 — the footer action carries `3A`'s loader while its work runs, and the dialog stands
        until the answer lands. `busy` is also what makes a second press visibly refused: the model
        turns one down for as long as this cell is drawn.
      */}
      <Button
        variant="accent"
        size="modal"
        state={checking ? 'busy' : 'idle'}
        onClick={revalidate}
        data-testid="validation-revalidate"
      >
        Re-validate
      </Button>
    </>
  )

  return (
    <ModalShell
      data-testid="validation-modal"
      title="Validation"
      width={560}
      bodyGap={10}
      header={{ ...(context === undefined ? {} : { context }), extra: badges, onClose: dismiss }}
      hint="esc to close"
      actions={actions}
      onDismiss={dismiss}
    >
      {findings.map((finding) => (
        <div
          key={`${finding.code}:${finding.source ?? ''}`}
          data-testid="validation-finding"
          className={cx(s.finding, findingTones[finding.severity])}
        >
          <div className={s.codeRow}>
            <div data-testid="validation-code" className={codeTones[finding.severity]}>
              {finding.code}
            </div>
            <div className={s.spacer} />
            {finding.source === undefined ? null : (
              <div data-testid="validation-source" className={sourceTones[finding.severity]}>
                {finding.source}
              </div>
            )}
          </div>
          <ProseText
            data-testid="validation-message"
            segments={finding.message}
            className={messageTones[finding.severity]}
          />
          {finding.actions === undefined || finding.actions.length === 0 ? null : (
            <div className={s.actionRow}>
              {finding.actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  data-testid="validation-action"
                  className={cx(s.action, actionTones[action.tone])}
                  onClick={action.onSelect}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </ModalShell>
  )
}, 'ValidationModal')
