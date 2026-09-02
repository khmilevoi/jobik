import { reatomComponent, useWrap } from '@reatom/react'
import { Button, SectionLabel } from '#primitives/index.js'
import { formatLastRunMeta } from '#run/format.js'
import { RunDivider, type RunDotTone, RunStatusDot, RunWell } from '#run/RunChrome/RunChrome.js'
import { RunInputControl } from '#run/RunInputControl/RunInputControl.js'
import { RunNodeTimings } from '#run/RunNodeList/RunNodeList.js'
import type { RunIdleState, RunInputDraftValue, RunSummary } from '#run/types.js'
import { validateRunInputs } from '#run/validate.js'
import s from './RunIdleView.module.css'

export interface RunIdleViewProps {
  readonly state: RunIdleState
}

/**
 * All three summary outcomes, spelled out; `satisfies` makes a fourth one a type error.
 *
 * `cancelled` takes the muted dot rather than the error one, exactly as `RunStateHeader`,
 * `FlowsSidebar`'s history rows and `RunToast` already do (R7): the word beside it says the user
 * chose to stop, and a failure colour would contradict it inside one line.
 */
const lastRunDotTone = {
  completed: 'ok',
  failed: 'failed',
  cancelled: 'cancelled',
} satisfies Record<RunSummary['status'], RunDotTone>

/**
 * `Studio — default`, lines 274–315.
 *
 * The whole body is `RunIdleState`, and that arm has no home of its own in `model/types.ts` — the
 * model publishes the four-arm union as one `RunPanelModel.state`, which `RunPanel` reads once and
 * discriminates. So this keeps its prop and is wrapped rather than converted; what changed is where
 * the object comes from, not what is in it.
 *
 * Returns a fragment: `RunDock`'s body supplies the `16px 14px` padding and the `16px` gap between
 * these blocks, and P4's contract forbids restating either.
 *
 * **This panel draws no start selector at all.** The entry point is chosen from the sidebar's
 * `Start` section or by clicking a start node on the canvas — see `FlowsSidebar` and
 * `FlowCanvas.onSelectStart` — so a single-start flow and a multi-start one look identical here.
 */
export const RunIdleView = reatomComponent(function RunIdleView(props: RunIdleViewProps) {
  const { state } = props
  const lastRun = state.lastRun
  const issues = state.issues ?? []

  // RTM-C02: these reach a Reatom action from a raw DOM event, so each is wrapped into the
  // model's frame — see StackTraceModal.tsx's own copy of the same pattern.
  const onDraftChange = useWrap((field: string, value: RunInputDraftValue) => {
    state.onDraftChange?.(field, value)
  }, 'RunIdleView.onDraftChange')

  const run = useWrap(() => {
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
  }, 'RunIdleView.run')

  return (
    <>
      <div data-testid="run-panel-note" className={s.note}>
        {state.note}
      </div>

      {state.descriptor.fields.map((field) => (
        <RunInputControl
          key={field.field}
          field={field}
          value={state.draft[field.field] ?? ''}
          presentation={state.presentation?.[field.field]}
          onChange={onDraftChange}
        />
      ))}

      {/*
        F02 — what the last press found, when it found anything. `RunIdleState.issues`' own doc
        comment carries the whole design reading: no artboard draws a rejected input, so this is
        the panel's own error well, the one the `Run panel — states` failed card draws, holding one
        row per problem. It sits directly above the button that produced it, and it is the caller's
        state so `⌘↵`, the docked control and the top bar all report onto it too.
      */}
      {issues.length === 0 ? null : (
        <RunWell data-testid="run-input-issues" tone="error" className={s.issues}>
          {issues.map((issue) => (
            <div
              key={`${issue.path}:${issue.message}`}
              data-testid={`run-input-issue-${issue.path}`}
              className={s.issue}
            >
              {issue.path === '' ? null : <div className={s.issuePath}>{issue.path}</div>}
              <div className={s.issueMessage}>{issue.message}</div>
            </div>
          ))}
        </RunWell>
      )}

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
}, 'RunIdleView')
