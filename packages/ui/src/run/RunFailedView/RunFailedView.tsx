import { reatomComponent } from '@reatom/react'
import { Button } from '#primitives/index.js'
import { formatHiddenFrames, formatStackFrame } from '#run/format.js'
import { RunAction, RunWell } from '#run/RunChrome/RunChrome.js'
import { RunInputControl } from '#run/RunInputControl/RunInputControl.js'
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
 *
 * `RunFailedState` is why `errore`'s value discipline survives this refactor intact: the failure is
 * a five-armed payload the panel renders — a tag, a node, a safe message and a trimmed stack — not
 * a boolean an async unit's `.error()` could carry. It arrives here as data, exactly as it did.
 */
export const RunFailedView = reatomComponent(function RunFailedView(props: RunFailedViewProps) {
  const { state } = props
  const stack = state.stack
  const hidden = stack === undefined ? undefined : formatHiddenFrames(stack.hiddenFrames)
  const inputs = state.inputs

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

      {inputs?.descriptor.fields.map((field) => (
        <RunInputControl
          key={field.field}
          field={field}
          value={inputs.draft[field.field] ?? ''}
          presentation={inputs.presentation?.[field.field]}
          onChange={inputs.onDraftChange}
        />
      ))}

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
}, 'RunFailedView')
