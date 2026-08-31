import { cx } from '#cx.js'
import { ModalShell } from '#modals/ModalShell/ModalShell.js'
import { type ProseSegment, ProseText } from '#modals/ProseText/ProseText.js'
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

export interface ValidationModalProps {
  /** The mono context line, e.g. `publication · flow.ts`. */
  readonly context: string
  readonly findings: readonly ValidationFinding[]
  readonly onCopyReport?: () => void
  readonly onRevalidate?: () => void
  /** `esc`, the `×` and a backdrop click all land here — this dialog is not destructive. */
  readonly onDismiss: () => void
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
 */
export function ValidationModal(props: ValidationModalProps) {
  const errors = props.findings.filter((finding) => finding.severity === 'error').length
  const warnings = props.findings.length - errors

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
        icon={<CopyIcon />}
        reserveWidth={118}
        onClick={props.onCopyReport}
      >
        Copy report
      </Button>
      <Button variant="accent" size="modal" onClick={props.onRevalidate}>
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
      header={{ context: props.context, extra: badges, onClose: props.onDismiss }}
      hint="esc to close"
      actions={actions}
      onDismiss={props.onDismiss}
    >
      {props.findings.map((finding) => (
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
}
