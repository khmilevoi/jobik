import { SectionLabel } from '../primitives/index.js'
import { accent, fontFamilies, motion, px, radii, textColors } from '../tokens.js'
import { formatNodesComplete } from './format.js'
import { RunAction, RunDivider, RunWell } from './RunChrome.js'
import { RunNodeRows } from './RunNodeList.js'
import { runPanelColors, runPanelMetrics } from './runPanelTokens.js'
import type { RunRunningState } from './types.js'

export interface RunRunningViewProps {
  readonly state: RunRunningState
}

/** `0`–`1` to a CSS percentage. The artboard's bar is `54%`. */
function progressWidth(progress: number): string {
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

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: px(8) }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div
            data-testid="run-progress-summary"
            style={{ fontSize: px(11.5), color: runPanelColors.actionLabel }}
          >
            {formatNodesComplete(state.completedNodes, state.totalNodes)}
          </div>
          <div
            data-testid="run-progress-elapsed"
            style={{
              fontFamily: fontFamilies.mono,
              fontSize: px(10),
              color: textColors.typeAnnotation,
            }}
          >
            {state.elapsed}
          </div>
        </div>
        <div
          data-testid="run-progress-bar"
          style={{
            height: px(runPanelMetrics.progressBarHeight),
            borderRadius: px(2),
            background: runPanelColors.progressTrack,
            overflow: 'hidden',
          }}
        >
          <div
            data-testid="run-progress-fill"
            style={{
              width: progressWidth(state.progress),
              height: px(runPanelMetrics.progressBarHeight),
              background: accent.cssVar,
            }}
          />
        </div>
      </div>

      {state.note === undefined ? null : (
        <div
          data-testid="run-panel-note"
          style={{ fontSize: px(11.5), color: runPanelColors.note, lineHeight: 1.5 }}
        >
          {state.note}
        </div>
      )}

      <RunNodeRows nodes={state.nodes} />

      {log === undefined ? null : (
        <>
          <RunDivider data-testid="run-panel-divider" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: px(9) }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <SectionLabel data-testid="run-live-log-label">Live log</SectionLabel>
              {log.followLabel === undefined ? null : (
                <div
                  data-testid="run-live-log-follow"
                  style={{
                    fontFamily: fontFamilies.mono,
                    fontSize: px(9.5),
                    color: textColors.faintest,
                  }}
                >
                  {log.followLabel}
                </div>
              )}
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: px(runPanelMetrics.logLineGap),
                fontFamily: fontFamilies.mono,
                fontSize: px(10),
                lineHeight: 1.5,
                color: textColors.muted,
              }}
            >
              {log.lines.map((line, index) => (
                <div key={`${line.time}-${line.text}`} data-testid={`run-log-line-${index}`}>
                  <span
                    data-testid={`run-log-time-${index}`}
                    style={{ color: textColors.faintest }}
                  >{`${line.time} `}</span>
                  {line.text}
                </div>
              ))}
              {log.pending === undefined ? null : (
                <div
                  data-testid="run-log-pending"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: px(6),
                    color: textColors.typeAnnotation,
                  }}
                >
                  <span
                    data-testid="run-log-caret"
                    style={{
                      width: px(runPanelMetrics.caretWidth),
                      height: px(runPanelMetrics.caretHeight),
                      background: accent.cssVar,
                      animation: motion.pulseFast,
                    }}
                  />
                  {log.pending}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {state.partialOutput !== true ? null : (
        <RunWell style={{ display: 'flex', flexDirection: 'column', gap: px(8) }}>
          <SectionLabel data-testid="run-partial-output-label">Partial output</SectionLabel>
          <div
            data-testid="run-partial-media"
            style={{
              height: px(runPanelMetrics.partialMediaHeight),
              borderRadius: px(radii.small),
              background: runPanelColors.skeleton,
              backgroundSize: runPanelMetrics.skeletonBackgroundSize,
              animation: motion.shimmer,
            }}
          />
          <div
            data-testid="run-partial-caption"
            style={{
              height: px(runPanelMetrics.partialCaptionHeight),
              width: runPanelMetrics.partialCaptionWidth,
              borderRadius: px(radii.badge),
              background: runPanelColors.skeleton,
              backgroundSize: runPanelMetrics.skeletonBackgroundSize,
              animation: motion.shimmer,
            }}
          />
        </RunWell>
      )}

      <RunAction data-testid="run-cancel-button" hint="esc" weight={500} onClick={state.onCancel}>
        Cancel run
      </RunAction>
    </>
  )
}
