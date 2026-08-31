import { cx } from '#cx.js'
import { SectionLabel } from '#primitives/index.js'
import type { RunLog } from '#run/types.js'
import s from './RunLogSection.module.css'

export interface RunLogSectionProps {
  readonly log: RunLog
  /**
   * `Live log` while the run streams (`Studio — run in progress`, 634) and `Log` once it has
   * settled (`2A`'s completed dock). The design gives the block two names and one anatomy, so the
   * name is a prop rather than two components.
   */
  readonly label: string
  readonly className?: string
}

/**
 * The mono log block, shared by the running and completed states.
 *
 * A line is `{ time, text }`. Core's `RunLogLine` is `{ nodeId, message, at }` and carries no
 * arrow-form message of its own — the artboard's `start1 → emit title, markdown` is whatever the
 * node logged, prefixed with the node id — so this renders exactly the two cells the panel is
 * given and composes nothing.
 */
export function RunLogSection(props: RunLogSectionProps) {
  const { log } = props

  return (
    <div className={cx(s.log, props.className)}>
      <div className={s.head}>
        <SectionLabel data-testid="run-log-label">{props.label}</SectionLabel>
        {log.followLabel === undefined ? null : (
          <div data-testid="run-log-follow" className={s.follow}>
            {log.followLabel}
          </div>
        )}
      </div>
      <div className={s.lines}>
        {log.lines.map((line, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the log is append-only, so the index is a stable key.
          <div key={index} data-testid={`run-log-line-${index}`}>
            <span data-testid={`run-log-time-${index}`} className={s.time}>{`${line.time} `}</span>
            {line.text}
          </div>
        ))}
        {log.pending === undefined ? null : (
          <div data-testid="run-log-pending" className={s.pending}>
            <span data-testid="run-log-caret" className={s.caret} />
            {log.pending}
          </div>
        )}
      </div>
    </div>
  )
}
