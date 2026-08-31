import { StripePlaceholder } from '#canvas/index.js'
import { Button, SectionLabel } from '#primitives/index.js'
import { formatAssetMeta } from '#run/format.js'
import { RunDivider, RunWell } from '#run/RunChrome/RunChrome.js'
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
 * `Run panel — states` completed, lines 836–864 — the body only. The card's `Completed` header is
 * `RunStateHeader`'s.
 */
export function RunCompletedView(props: RunCompletedViewProps) {
  const { state } = props
  return (
    <>
      <RunNodeTimings nodes={state.nodes} variant="completed" />
      {state.outputs.length === 0 ? null : (
        <>
          <RunDivider data-testid="run-panel-divider" />
          <SectionLabel data-testid="run-outputs-label">Outputs</SectionLabel>
          <div className={s.outputs}>
            {state.outputs.map((output) => (
              <OutputRow key={output.field} output={output} />
            ))}
          </div>
        </>
      )}
    </>
  )
}
