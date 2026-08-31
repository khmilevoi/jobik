import type { StyleWithVars } from '#cx.js'
import { SectionLabel } from '#primitives/index.js'
import { formatNodesComplete } from '#run/format.js'
import { RunAction, RunDivider, RunWell } from '#run/RunChrome/RunChrome.js'
import { RunLogSection } from '#run/RunLogSection/RunLogSection.js'
import { RunNodeRows, RunNodeTimings } from '#run/RunNodeList/RunNodeList.js'
import type { RunPanelVariant, RunRunningState } from '#run/types.js'
import s from './RunRunningView.module.css'

export interface RunRunningViewProps {
  readonly state: RunRunningState
  /**
   * `dock` (the default) is `Studio — run in progress`: the `1 of 3 nodes complete` / `1.3s` head
   * row above the bar, then the 30px node rows. `card` is the `Run panel — states` running card,
   * which shows the bar alone and the compact mono timings instead. Both artboards are the design;
   * they differ because one is 320px of a live shell and the other a 430px state card.
   */
  readonly variant?: RunPanelVariant
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
 * The union of `Studio — run in progress` lines 595–648 and `Run panel — states` lines 779–793,
 * with `variant` choosing which of the two node treatments the run is drawn with.
 *
 * Returns a fragment: `RunDock`'s body supplies the padding and the `16px` gap between blocks.
 */
export function RunRunningView(props: RunRunningViewProps) {
  const { state } = props
  const log = state.log
  const card = props.variant === 'card'
  const fill: StyleWithVars = { '--jbk-run-progress': progressWidth(state.progress) }

  return (
    <>
      <div className={s.progress}>
        {card ? null : (
          <div className={s.progressHead}>
            <div data-testid="run-progress-summary" className={s.progressSummary}>
              {formatNodesComplete(state.completedNodes, state.totalNodes)}
            </div>
            <div data-testid="run-progress-elapsed" className={s.progressElapsed}>
              {state.elapsed}
            </div>
          </div>
        )}
        <div data-testid="run-progress-bar" className={s.progressTrack}>
          <div data-testid="run-progress-fill" className={s.progressFill} style={fill} />
        </div>
      </div>

      {state.note === undefined ? null : (
        <div data-testid="run-panel-note" className={s.note}>
          {state.note}
        </div>
      )}

      {card ? (
        <RunNodeTimings nodes={state.nodes} variant="running" />
      ) : (
        <RunNodeRows nodes={state.nodes} />
      )}

      {log === undefined ? null : (
        <>
          <RunDivider data-testid="run-panel-divider" />
          <RunLogSection log={log} label="Live log" />
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
