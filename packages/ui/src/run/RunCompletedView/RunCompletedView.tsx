import { StripePlaceholder } from '#canvas/index.js'
import { Button, SectionLabel } from '#primitives/index.js'
import { formatAssetMeta } from '#run/format.js'
import { RunDivider, RunWell } from '#run/RunChrome/RunChrome.js'
import { RunInputControl } from '#run/RunInputControl/RunInputControl.js'
import { RunLogSection } from '#run/RunLogSection/RunLogSection.js'
import { RunNodeTimings } from '#run/RunNodeList/RunNodeList.js'
import { runPanelMetrics } from '#run/runPanelTokens.js'
import type { RunCompletedState, RunOutputField } from '#run/types.js'
import { radii } from '#tokens.js'
import s from './RunCompletedView.module.css'

/**
 * The two non-asset output kinds and the well each takes. Spelled out so `satisfies` catches a
 * fourth kind in `RunOutputField` and `cssModuleUsage.test.ts` can see both reads.
 */
const valueWells = {
  text: s.textWell,
  url: s.urlWell,
} satisfies Record<Exclude<RunOutputField['kind'], 'asset'>, string>

function OutputRow(props: { readonly output: RunOutputField }) {
  const { output } = props

  if (output.kind === 'asset') {
    return (
      <div className={s.assetRow}>
        <div data-testid={`run-output-thumb-${output.field}`} className={s.thumb}>
          {output.thumbnail ?? (
            <StripePlaceholder height={runPanelMetrics.thumbnailSize} radius={radii.small} />
          )}
        </div>
        <div className={s.assetText}>
          <div data-testid={`run-output-name-${output.field}`} className={s.assetName}>
            {output.field}
          </div>
          <div data-testid={`run-output-meta-${output.field}`} className={s.assetMeta}>
            {output.meta ?? formatAssetMeta(output.asset)}
          </div>
        </div>
        <div className={s.spacer} />
        <Button
          variant="quiet"
          size="sm"
          data-testid={`run-output-open-${output.field}`}
          onClick={output.onOpen}
        >
          Open
        </Button>
      </div>
    )
  }

  return (
    <div className={s.valueRow}>
      <div data-testid={`run-output-name-${output.field}`} className={s.valueName}>
        {output.field}
      </div>
      <RunWell
        data-testid={`run-output-well-${output.field}`}
        padding={runPanelMetrics.wellPaddingText}
        className={valueWells[output.kind]}
      >
        {output.value}
      </RunWell>
    </div>
  )
}

export interface RunCompletedViewProps {
  readonly state: RunCompletedState
}

/**
 * The completed panel, in `2A`'s shape — the newest artboard, and the one that shows the state
 * inside a live shell: per-node timings, the inputs still shown and still editable, `Re-run
 * start1 ⌘↵`, a divider, and the `Log` / `tail` tail.
 *
 * `Run panel — states`' completed card (lines 836–864) is the older half of the evidence and puts
 * the run's outputs here instead. `2A` moves them to the bottom output dock, so `outputs` is
 * optional: a Studio that has not mounted that dock keeps its outputs reachable, and one that has
 * simply stops passing them. When they are passed, the `Outputs` section sits between the inputs
 * and the primary, which is the one order `07-copy.md` §8 states for a completed panel carrying
 * both.
 *
 * The card's `Completed` header is `RunStateHeader`'s, not this view's.
 */
export function RunCompletedView(props: RunCompletedViewProps) {
  const { state } = props
  const inputs = state.inputs
  const log = state.log
  const outputs = state.outputs ?? []

  return (
    <>
      <RunNodeTimings nodes={state.nodes} variant="completed" />

      {inputs?.descriptor.fields.map((field) => (
        <RunInputControl
          key={field.field}
          field={field}
          value={inputs.draft[field.field] ?? ''}
          presentation={inputs.presentation?.[field.field]}
          onChange={inputs.onDraftChange}
        />
      ))}

      {outputs.length === 0 ? null : (
        <>
          <RunDivider data-testid="run-panel-divider" />
          <SectionLabel data-testid="run-outputs-label">Outputs</SectionLabel>
          <div className={s.outputs}>
            {outputs.map((output) => (
              <OutputRow key={output.field} output={output} />
            ))}
          </div>
        </>
      )}

      {state.entryNodeId === undefined ? null : (
        <Button
          variant="accent"
          size="lg"
          hint="⌘↵"
          data-testid="run-rerun-button"
          onClick={state.onRerun}
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
}
