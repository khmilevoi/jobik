import { Button, SectionLabel } from '../primitives/index.js'
import { fontFamilies, px, statusColors, textColors } from '../tokens.js'
import { formatLastRunMeta } from './format.js'
import { RunDivider, RunStatusDot } from './RunChrome.js'
import { RunInputControl } from './RunInputControl.js'
import { RunNodeTimings } from './RunNodeList.js'
import { runPanelColors } from './runPanelTokens.js'
import type { RunIdleState } from './types.js'
import { validateRunInputs } from './validate.js'

export interface RunIdleViewProps {
  readonly state: RunIdleState
}

/**
 * `Studio — default`, lines 274–315.
 *
 * Returns a fragment: `RunDock`'s body supplies the `16px 14px` padding and the `16px` gap between
 * these blocks, and P4's contract forbids restating either.
 */
export function RunIdleView(props: RunIdleViewProps) {
  const { state } = props
  const lastRun = state.lastRun

  const run = () => {
    const values = validateRunInputs({
      input: state.input,
      fields: state.descriptor.fields,
      draft: state.draft,
    })
    if (values instanceof Error) {
      state.onInvalid?.(values)
      return
    }
    state.onRun?.(values)
  }

  return (
    <>
      <div
        data-testid="run-panel-note"
        style={{ fontSize: px(11.5), color: runPanelColors.note, lineHeight: 1.5 }}
      >
        {state.note}
      </div>

      {state.descriptor.fields.map((field) => (
        <RunInputControl
          key={field.field}
          field={field}
          value={state.draft[field.field] ?? ''}
          presentation={state.presentation?.[field.field]}
          onChange={state.onDraftChange}
        />
      ))}

      <Button variant="accent" size="lg" hint="⌘↵" onClick={run} data-testid="run-start-button">
        {`Run ${state.entryNodeId}`}
      </Button>

      {lastRun === undefined ? null : (
        <>
          <RunDivider data-testid="run-panel-divider" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: px(9) }}>
            <SectionLabel data-testid="run-last-run-label">Last run</SectionLabel>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: px(7) }}>
                <RunStatusDot
                  data-testid="run-last-run-dot"
                  shape="round"
                  color={lastRun.status === 'failed' ? statusColors.failed : statusColors.ok}
                />
                <div
                  data-testid="run-last-run-status"
                  style={{ fontSize: px(11.5), color: textColors.fieldLabel }}
                >
                  {lastRun.status}
                </div>
              </div>
              <div
                data-testid="run-last-run-meta"
                style={{
                  fontFamily: fontFamilies.mono,
                  fontSize: px(10),
                  color: textColors.typeAnnotation,
                }}
              >
                {formatLastRunMeta(lastRun.totalElapsed, lastRun.nodeCount)}
              </div>
            </div>
            <RunNodeTimings nodes={lastRun.timings} variant="lastRun" />
          </div>
        </>
      )}
    </>
  )
}
