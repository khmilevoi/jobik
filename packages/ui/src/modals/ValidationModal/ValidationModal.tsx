import { reatomComponent, useAction } from '@reatom/react'
import { cx } from '#cx.js'
import { ModalShell } from '#modals/ModalShell/ModalShell.js'
import { type ProseSegment, ProseText } from '#modals/ProseText/ProseText.js'
import { useStudioModel } from '#model/context.js'
import { CopyIcon } from '#primitives/icons/CopyIcon.js'
import { Button } from '#primitives/index.js'
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
 * It takes no props: `ValidationModel.reportOpen` is whether it stands, `findings` is the list,
 * `flows.descriptor` builds the `publication · flow.ts` context line, `validate` is `Re-validate`
 * and `closeReport` is every dismissal. The guard is here rather than in `StudioApp` for the
 * reason `CancelRunModal`'s is — RTM-C01 means a shut dialog subscribes to `reportOpen` and reads
 * nothing else.
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
 * `Copy report` is the same story in miniature: `3C` §2 draws the button, no model unit backs it,
 * and a `copyReport` action added here would be state invented to satisfy a refactor. It is drawn
 * inert, which is exactly what `StudioApp` already rendered — it never passed `onCopyReport`.
 */
export const ValidationModal = reatomComponent(function ValidationModal() {
  const { flows, validation } = useStudioModel()

  // RTM-C02: both are pressed from a DOM event, outside this render's frame. They are declared
  // above the guards because they are hooks, and they read no atom, so hoisting them costs the
  // lazy-read discipline below nothing.
  const revalidate = useAction(validation.validate)
  const dismiss = useAction(validation.closeReport)

  // RTM-C01: the guards first, and every value the body draws only after them.
  if (!validation.reportOpen()) return null
  const findings = validation.findings()
  if (findings === undefined) return null

  const descriptor = flows.descriptor()
  const context = `${descriptor?.name ?? ''} · ${descriptor?.sourceFile ?? ''}`
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
      <Button variant="quiet" size="modal" icon={<CopyIcon />} reserveWidth={118}>
        Copy report
      </Button>
      <Button variant="accent" size="modal" onClick={revalidate}>
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
      header={{ context, extra: badges, onClose: dismiss }}
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
