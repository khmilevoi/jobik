import { Button } from '../primitives/index.js'
import { fontFamilies, px, statusColors, textColors } from '../tokens.js'
import { formatHiddenFrames, formatStackFrame } from './format.js'
import { RunAction, RunWell } from './RunChrome.js'
import { RunNodeTimings } from './RunNodeList.js'
import { runPanelColors } from './runPanelTokens.js'
import type { RunFailedState } from './types.js'

export interface RunFailedViewProps {
  readonly state: RunFailedState
}

/**
 * `Run panel — states` failed, lines 802–827 — the body only. The card's error-tinted header is
 * `RunStateHeader`'s, because `RunDock` already draws a header above this body.
 *
 * Every string here arrives on props. P10 and P13 produce the safe message and the trimmed frames;
 * this view constructs no error and never reads a `cause`.
 */
export function RunFailedView(props: RunFailedViewProps) {
  const { state } = props
  const stack = state.stack
  const hidden = stack === undefined ? undefined : formatHiddenFrames(stack.hiddenFrames)

  return (
    <>
      <RunWell
        data-testid="run-error-well"
        tone="error"
        style={{ display: 'flex', flexDirection: 'column', gap: px(6) }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div
            data-testid="run-error-name"
            style={{
              fontFamily: fontFamilies.mono,
              fontSize: px(11),
              color: statusColors.errorTag,
            }}
          >
            {state.error.name}
          </div>
          <div
            data-testid="run-error-node"
            style={{
              fontFamily: fontFamilies.mono,
              fontSize: px(9.5),
              color: runPanelColors.failedMeta,
            }}
          >
            {state.error.nodeId}
          </div>
        </div>
        <div
          data-testid="run-error-message"
          style={{ fontSize: px(11.5), color: statusColors.errorBody, lineHeight: 1.55 }}
        >
          {state.error.message}
        </div>
      </RunWell>

      <RunNodeTimings nodes={state.nodes} variant="failed" />

      {stack === undefined ? null : (
        <RunWell
          data-testid="run-stack"
          style={{
            fontFamily: fontFamilies.mono,
            fontSize: px(10),
            lineHeight: 1.6,
            color: textColors.muted,
          }}
        >
          <div data-testid="run-stack-label" style={{ color: textColors.sectionLabel }}>
            stack
          </div>
          {stack.frames.map((frame, index) => (
            <div
              key={`${frame.file}:${frame.line}:${frame.fn}`}
              data-testid={`run-stack-frame-${index}`}
            >
              {formatStackFrame(frame)}
            </div>
          ))}
          {hidden === undefined ? null : (
            <div data-testid="run-stack-hidden" style={{ color: textColors.sectionLabel }}>
              {hidden}
            </div>
          )}
        </RunWell>
      )}

      <div style={{ display: 'flex', gap: px(8) }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <RunAction data-testid="run-copy-log" onClick={state.onCopyLog}>
            Copy log
          </RunAction>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Button variant="accent" size="lg" data-testid="run-rerun" onClick={state.onRerun}>
            Re-run
          </Button>
        </div>
      </div>
    </>
  )
}
