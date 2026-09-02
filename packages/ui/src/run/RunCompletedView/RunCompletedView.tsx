import { reatomComponent, useWrap } from '@reatom/react'
import { Button } from '#primitives/index.js'
import { RunDivider } from '#run/RunChrome/RunChrome.js'
import { RunInputControl } from '#run/RunInputControl/RunInputControl.js'
import { RunLogSection } from '#run/RunLogSection/RunLogSection.js'
import { RunNodeTimings } from '#run/RunNodeList/RunNodeList.js'
import type { RunCompletedState, RunInputDraftValue } from '#run/types.js'

export interface RunCompletedViewProps {
  readonly state: RunCompletedState
}

/**
 * The completed panel, in `2A`'s shape — the newest artboard, and the one that shows the state
 * inside a live shell: per-node timings, a divider (`:1207`), the inputs still shown and still
 * editable, `Re-run start1 ⌘↵`, a divider, and the `Log` / `tail` tail.
 *
 * There is no `Outputs` section here. `Run panel — states`' completed card (lines 836–864) drew
 * one, and R8 briefly carried it here too — but the bottom `OutputDock` now shows the very same
 * run's output, and once `model/output.ts`'s `viewerNodeId` started auto-opening onto it the moment
 * a run settles successfully (rather than requiring a manual `Show output` on the collapsed strip),
 * printing the fields a second time inside this panel was a value repeated, not a value that could
 * only be found here. The dock is the one place outputs live now; this panel stops at the primary.
 *
 * The card's `Completed` header is `RunStateHeader`'s, not this view's.
 */
export const RunCompletedView = reatomComponent(function RunCompletedView(
  props: RunCompletedViewProps,
) {
  const { state } = props
  const inputs = state.inputs
  const log = state.log

  // RTM-C02: these reach a Reatom action from a raw DOM event, so each is wrapped into the
  // model's frame — see StackTraceModal.tsx's own copy of the same pattern.
  const onDraftChange = useWrap((field: string, value: RunInputDraftValue) => {
    inputs?.onDraftChange?.(field, value)
  }, 'RunCompletedView.onDraftChange')

  const onRerun = useWrap(() => {
    state.onRerun?.()
  }, 'RunCompletedView.onRerun')

  return (
    <>
      <RunNodeTimings nodes={state.nodes} variant="completed" />

      {/* `2A:1207` — the rule between the timings block (`:1201-1205`) and the first input group
          (`:1209`). It divides two blocks, so a panel re-showing no inputs draws none. */}
      {inputs === undefined ? null : <RunDivider data-testid="run-inputs-divider" />}

      {inputs?.descriptor.fields.map((field) => (
        <RunInputControl
          key={field.field}
          field={field}
          value={inputs.draft[field.field] ?? ''}
          presentation={inputs.presentation?.[field.field]}
          onChange={onDraftChange}
        />
      ))}

      {state.entryNodeId === undefined ? null : (
        <Button
          variant="accent"
          size="lg"
          hint="⌘↵"
          data-testid="run-rerun-button"
          onClick={onRerun}
        >
          {`Re-run ${state.entryNodeId}`}
        </Button>
      )}

      {log === undefined ? null : (
        <>
          <RunDivider data-testid="run-log-divider" />
          <RunLogSection log={log} label="Log" />
        </>
      )}
    </>
  )
}, 'RunCompletedView')
