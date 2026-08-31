import s from './LogLines.module.css'

export interface OutputLogLine {
  /** The mono elapsed stamp, e.g. `0.31`. */
  readonly time: string
  /** The node-attributed line, e.g. `render layout pass complete`. */
  readonly message: string
}

export interface LogLinesProps {
  readonly lines: readonly OutputLogLine[]
}

/**
 * The `Logs` tab body.
 *
 * The `Output viewer` artboard fixes no Logs state, so this reuses the same design file's
 * `Live log` treatment from `Studio — run in progress` (design 634–639) without the pulsing caret,
 * which belongs to the run panel's live state and is P11's.
 */
export function LogLines(props: LogLinesProps) {
  return (
    <div data-testid="output-logs" className={s.logs}>
      {props.lines.map((line, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: log lines have no stable identity of their own
        <div key={`${index}-${line.time}`} data-testid="output-log-line">
          <span data-testid="output-log-time" className={s.time}>
            {line.time}{' '}
          </span>
          {line.message}
        </div>
      ))}
    </div>
  )
}
