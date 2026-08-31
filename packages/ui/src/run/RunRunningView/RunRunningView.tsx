import type { StyleWithVars } from '../../cx.js'
import { SectionLabel } from '../../primitives/index.js'
import { formatNodesComplete } from '../format.js'
import { RunAction, RunDivider, RunWell } from '../RunChrome/RunChrome.js'
import { RunNodeRows } from '../RunNodeList/RunNodeList.js'
import type { RunRunningState } from '../types.js'
import s from './RunRunningView.module.css'

export interface RunRunningViewProps {
  readonly state: RunRunningState
}

/**
 * `0`–`1` to a CSS percentage. The artboard's bar is `54%`.
 *
 * Exported so its clamping is tested as the pure function it is rather than through a rendered
 * bar: the width itself is now a custom property the stylesheet reads, and the DOM only has to
 * prove the plumbing once.
 */
export function progressWidth(progress: number): string {
  const clamped = Math.min(1, Math.max(0, progress))
  return `${Math.round(clamped * 100)}%`
}

/**
 * The union of `Studio — run in progress` lines 595–648 and `Run panel — states` lines 779–793.
 *
 * Returns a fragment: `RunDock`'s body supplies the padding and the `16px` gap between blocks.
 */
export function RunRunningView(props: RunRunningViewProps) {
  const { state } = props
  const log = state.log
  const fill: StyleWithVars = { '--jbk-run-progress': progressWidth(state.progress) }

  return (
    <>
      <div className={s.progress}>
        <div className={s.progressHead}>
          <div data-testid="run-progress-summary" className={s.progressSummary}>
            {formatNodesComplete(state.completedNodes, state.totalNodes)}
          </div>
          <div data-testid="run-progress-elapsed" className={s.progressElapsed}>
            {state.elapsed}
          </div>
        </div>
        <div data-testid="run-progress-bar" className={s.progressTrack}>
          <div data-testid="run-progress-fill" className={s.progressFill} style={fill} />
        </div>
      </div>

      {state.note === undefined ? null : (
        <div data-testid="run-panel-note" className={s.note}>
          {state.note}
        </div>
      )}

      <RunNodeRows nodes={state.nodes} />

      {log === undefined ? null : (
        <>
          <RunDivider data-testid="run-panel-divider" />
          <div className={s.log}>
            <div className={s.logHead}>
              <SectionLabel data-testid="run-live-log-label">Live log</SectionLabel>
              {log.followLabel === undefined ? null : (
                <div data-testid="run-live-log-follow" className={s.logFollow}>
                  {log.followLabel}
                </div>
              )}
            </div>
            <div className={s.logLines}>
              {log.lines.map((line, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: the log is append-only, so the index is a stable key.
                <div key={index} data-testid={`run-log-line-${index}`}>
                  <span
                    data-testid={`run-log-time-${index}`}
                    className={s.logTime}
                  >{`${line.time} `}</span>
                  {line.text}
                </div>
              ))}
              {log.pending === undefined ? null : (
                <div data-testid="run-log-pending" className={s.logPending}>
                  <span data-testid="run-log-caret" className={s.logCaret} />
                  {log.pending}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {state.partialOutput !== true ? null : (
        <RunWell className={s.partial}>
          <SectionLabel data-testid="run-partial-output-label">Partial output</SectionLabel>
          <div data-testid="run-partial-media" className={s.partialMedia} />
          <div data-testid="run-partial-caption" className={s.partialCaption} />
        </RunWell>
      )}

      <RunAction data-testid="run-cancel-button" hint="esc" weight={500} onClick={state.onCancel}>
        Cancel run
      </RunAction>
    </>
  )
}
