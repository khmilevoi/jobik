import { Button, SectionLabel, SegmentedControl } from '#primitives/index.js'
import { formatLastRunMeta } from '#run/format.js'
import { RunDivider, type RunDotTone, RunStatusDot } from '#run/RunChrome/RunChrome.js'
import { RunInputControl } from '#run/RunInputControl/RunInputControl.js'
import { RunNodeTimings } from '#run/RunNodeList/RunNodeList.js'
import type { RunIdleState, RunSummary } from '#run/types.js'
import { validateRunInputs } from '#run/validate.js'
import s from './RunIdleView.module.css'

export interface RunIdleViewProps {
  readonly state: RunIdleState
}

/** Both summary outcomes, spelled out; `satisfies` makes a third one a type error. */
const lastRunDotTone = {
  completed: 'ok',
  failed: 'failed',
} satisfies Record<RunSummary['status'], RunDotTone>

/**
 * `Studio — default`, lines 274–315.
 *
 * Returns a fragment: `RunDock`'s body supplies the `16px 14px` padding and the `16px` gap between
 * these blocks, and P4's contract forbids restating either.
 *
 * **The start chooser is the one thing here the design does not draw.** Every artboard shows
 * `publication`, which declares a single start, so the panel is only ever drawn as the design
 * fixes it; a flow with two starts gets `3C`'s own `SegmentedControl` — the design's only
 * segmented control, and no new shape — above the inputs it re-seeds. With one start nothing is
 * rendered at all, so a single-start flow's panel is unchanged down to the DOM.
 */
export function RunIdleView(props: RunIdleViewProps) {
  const { state } = props
  const lastRun = state.lastRun
  const startIds = state.startIds ?? []
  const onSelectStart = state.onSelectStart

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
      <div data-testid="run-panel-note" className={s.note}>
        {state.note}
      </div>

      {startIds.length > 1 ? (
        <div className={s.startChooser}>
          <div className={s.startLabel}>Start</div>
          <SegmentedControl
            data-testid="run-start-chooser"
            label="Start"
            options={startIds.map((id) => ({ value: id, label: id }))}
            value={state.entryNodeId}
            {...(onSelectStart === undefined ? {} : { onChange: onSelectStart })}
          />
        </div>
      ) : null}

      {state.descriptor.fields.map((field) => (
        <RunInputControl
          key={field.field}
          field={field}
          value={state.draft[field.field] ?? ''}
          presentation={state.presentation?.[field.field]}
          onChange={state.onDraftChange}
        />
      ))}

      {/*
        `3B`, via `Button`'s own `dimmed`: an error stands, so the primary drops to 45 % and stops
        responding, and changes nothing else. The docked control and the top bar's run pill say the
        same thing off the same caller-supplied predicate; this one was simply never wired, because
        its chrome lives here rather than in `shell/`.
      */}
      <Button
        variant="accent"
        size="lg"
        hint="⌘↵"
        onClick={run}
        dimmed={state.blocked}
        data-testid="run-start-button"
      >
        {`Run ${state.entryNodeId}`}
      </Button>

      {lastRun === undefined ? null : (
        <>
          <RunDivider data-testid="run-panel-divider" />
          <div className={s.lastRun}>
            <SectionLabel data-testid="run-last-run-label">Last run</SectionLabel>
            <div className={s.lastRunHead}>
              <div className={s.lastRunStatus}>
                <RunStatusDot
                  data-testid="run-last-run-dot"
                  shape="round"
                  tone={lastRunDotTone[lastRun.status]}
                />
                <div data-testid="run-last-run-status" className={s.lastRunStatusLabel}>
                  {lastRun.status}
                </div>
              </div>
              <div data-testid="run-last-run-meta" className={s.lastRunMeta}>
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
