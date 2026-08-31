import { Button } from '#primitives/index.js'
import { formatHiddenFrames, formatStackFrame } from '#run/format.js'
import { RunAction, RunWell } from '#run/RunChrome/RunChrome.js'
import { RunNodeTimings } from '#run/RunNodeList/RunNodeList.js'
import type { RunFailedState } from '#run/types.js'
import s from './RunFailedView.module.css'

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
      <RunWell data-testid="run-error-well" tone="error" className={s.errorWell}>
        <div className={s.errorHead}>
          <div data-testid="run-error-name" className={s.errorName}>
            {state.error.name}
          </div>
          <div data-testid="run-error-node" className={s.errorNode}>
            {state.error.nodeId}
          </div>
        </div>
        <div data-testid="run-error-message" className={s.errorMessage}>
          {state.error.message}
        </div>
      </RunWell>

      <RunNodeTimings nodes={state.nodes} variant="failed" />

      {stack === undefined ? null : (
        <RunWell data-testid="run-stack" className={s.stack}>
          <div data-testid="run-stack-label" className={s.stackAside}>
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
            <div data-testid="run-stack-hidden" className={s.stackAside}>
              {hidden}
            </div>
          )}
        </RunWell>
      )}

      <div className={s.actions}>
        <div className={s.action}>
          <RunAction data-testid="run-copy-log" onClick={state.onCopyLog}>
            Copy log
          </RunAction>
        </div>
        <div className={s.action}>
          <Button variant="accent" size="lg" data-testid="run-rerun" onClick={state.onRerun}>
            Re-run
          </Button>
        </div>
      </div>
    </>
  )
}
