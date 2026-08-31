import { cx } from '#cx.js'
import s from './ProblemsStrip.module.css'

/**
 * `3D` §3D.3 — the invalid board's strip. It **replaces** the status strip rather than joining it:
 * a header counting what was found, then one 28 px row per finding, the first of them highlighted.
 *
 * The header count is derived from the rows, never passed in. `3D` draws `2 errors, 1 warning`
 * because its board has three findings; a strip fed one finding says `1 error`, and one fed a list
 * with no warnings never mentions warnings at all. The artboard's own convention (`07-copy.md`
 * §12, as extended by `3D`) is a comma-joined count, singular at one.
 */

export type ProblemSeverity = 'error' | 'warning'

export interface ProblemRow {
  readonly severity: ProblemSeverity
  /** The error class, mono — `TypeMismatch`, `ConnectionError`. */
  readonly code: string
  /** One sentence, in the server's own words. */
  readonly message: string
  /** `flow.ts:41`. Omitted when nothing can say where — see the report. */
  readonly source?: string
}

export interface ProblemsStripProps {
  readonly problems: readonly ProblemRow[]
  /** `Open report` — the accent action at the right of the header. */
  readonly onOpenReport?: () => void
}

/** `2 errors, 1 warning`, `1 error`, `3 warnings` — comma-joined, singular at one, empty clauses dropped. */
export function problemCountLabel(problems: readonly ProblemRow[]): string {
  const errors = problems.filter((problem) => problem.severity === 'error').length
  const warnings = problems.length - errors
  const parts: string[] = []
  if (errors > 0) parts.push(errors === 1 ? '1 error' : `${errors} errors`)
  if (warnings > 0) parts.push(warnings === 1 ? '1 warning' : `${warnings} warnings`)
  return parts.join(', ')
}

/**
 * The highlighted row and the plain rows are the same three cells at two strengths — the artboard
 * writes the first row's code, message and location one step brighter than the rest, on its own
 * fill. Written out in full so a missing severity is a type error.
 */
const codeTones = {
  error: s.codeError,
  warning: s.codeWarning,
} satisfies Record<ProblemSeverity, string>

/**
 * The highlighted row lifts its error code from `#c96a5c` to `#dc8577`. A **warning** does not
 * lift: the artboard draws no highlighted warning row, and `09-modals.md` gives warning severity
 * one `#b3a069` on both of its surfaces, so inventing a brighter step would be inventing a colour.
 */
const selectedCodeTones = {
  error: s.codeErrorSelected,
  warning: s.codeWarning,
} satisfies Record<ProblemSeverity, string>

export function ProblemsStrip(props: ProblemsStripProps) {
  const { problems } = props

  return (
    <div data-testid="studio-problems-strip" className={s.strip}>
      <div className={s.header}>
        <div className={s.dot} />
        <div data-testid="studio-problems-count" className={s.count}>
          {problemCountLabel(problems)}
        </div>
        <div className={s.spacer} />
        {props.onOpenReport === undefined ? null : (
          <button
            type="button"
            data-testid="studio-problems-open-report"
            onClick={props.onOpenReport}
            className={s.openReport}
          >
            Open report
          </button>
        )}
      </div>
      {problems.map((problem, index) => {
        // The artboard fills the first row only — the problem currently being read.
        const selected = index === 0
        return (
          <div
            key={`${problem.code}:${problem.message}`}
            data-testid="studio-problem-row"
            className={cx(s.row, selected && s.rowSelected)}
          >
            <div
              className={cx(
                s.code,
                selected ? selectedCodeTones[problem.severity] : codeTones[problem.severity],
              )}
            >
              {problem.code}
            </div>
            <div className={cx(s.message, selected && s.messageSelected)}>{problem.message}</div>
            {problem.source === undefined ? null : (
              <div className={cx(s.source, selected && s.sourceSelected)}>{problem.source}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
