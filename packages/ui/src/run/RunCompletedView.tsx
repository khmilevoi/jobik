import { StripePlaceholder } from '../canvas/StripePlaceholder.js'
import { Button, SectionLabel } from '../primitives/index.js'
import { accent, fontFamilies, px, radii, textColors } from '../tokens.js'
import { formatAssetMeta } from './format.js'
import { RunDivider, RunWell } from './RunChrome.js'
import { RunNodeTimings } from './RunNodeList.js'
import { runPanelMetrics } from './runPanelTokens.js'
import type { RunCompletedState, RunOutputField } from './types.js'

function OutputRow(props: { readonly output: RunOutputField }) {
  const { output } = props

  if (output.kind === 'asset') {
    return (
      <div style={{ display: 'flex', gap: px(9), alignItems: 'center' }}>
        <div
          data-testid={`run-output-thumb-${output.field}`}
          style={{
            width: px(runPanelMetrics.thumbnailSize),
            height: px(runPanelMetrics.thumbnailSize),
            flex: 'none',
            borderRadius: px(radii.small),
            overflow: 'hidden',
          }}
        >
          {output.thumbnail ?? (
            <StripePlaceholder height={runPanelMetrics.thumbnailSize} radius={radii.small} />
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: px(3), minWidth: 0 }}>
          <div
            data-testid={`run-output-name-${output.field}`}
            style={{
              fontFamily: fontFamilies.mono,
              fontSize: px(11),
              color: textColors.activeIdentifier,
            }}
          >
            {output.field}
          </div>
          <div
            data-testid={`run-output-meta-${output.field}`}
            style={{
              fontFamily: fontFamilies.mono,
              fontSize: px(9.5),
              color: textColors.typeAnnotation,
            }}
          >
            {output.meta ?? formatAssetMeta(output.asset)}
          </div>
        </div>
        <div style={{ flex: 1 }} />
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

  const url = output.kind === 'url'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: px(4) }}>
      <div
        data-testid={`run-output-name-${output.field}`}
        style={{
          fontFamily: fontFamilies.mono,
          fontSize: px(11),
          color: textColors.activeFieldLabel,
        }}
      >
        {output.field}
      </div>
      <RunWell
        data-testid={`run-output-well-${output.field}`}
        padding={runPanelMetrics.wellPaddingText}
        style={
          url
            ? {
                fontFamily: fontFamilies.mono,
                fontSize: px(10.5),
                color: accent.cssVar,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }
            : { fontSize: px(11.5), color: textColors.fieldLabel, lineHeight: 1.5 }
        }
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
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: px(runPanelMetrics.outputRowGap),
            }}
          >
            {state.outputs.map((output) => (
              <OutputRow key={output.field} output={output} />
            ))}
          </div>
        </>
      )}
    </>
  )
}
