import type { CSSProperties } from 'react'
import {
  accent,
  borders,
  fontFamilies,
  fontWeights,
  layout,
  px,
  statusColors,
  textColors,
} from '../tokens.js'
import { formatRunMeta } from './format.js'
import { RunSpinner, RunStatusDot } from './RunChrome.js'
import { runPanelColors } from './runPanelTokens.js'
import type { RunPanelState } from './types.js'

export interface RunStateHeaderProps {
  readonly state: RunPanelState
  /** The idle header reads `Run` plus this, in accent mono. */
  readonly entryNodeId: string
}

/**
 * The 38px header of the `Run panel — states` cards: `Running` (lines 772–778), `Run failed` on the
 * error wash (796–802), `Completed` (831–837), and `Run start1` for the idle card
 * (`Studio — default`, 590–594).
 *
 * `RunPanel` does NOT render this. P4's `RunDock` already draws a header above the panel body and
 * this plan may not stack a second one inside it; only `RunPanelCard` places it. Hoisting it into
 * `RunDock` — the spec's "during and after a run the chevron is replaced by the run number" — is a
 * shell change, reported as a gap rather than made here.
 */
export function RunStateHeader(props: RunStateHeaderProps) {
  const { state } = props
  const failed = state.kind === 'failed'

  const wash: CSSProperties = failed
    ? {
        background: runPanelColors.failedHeaderWash,
        borderBottom: `1px solid ${runPanelColors.failedFrame}`,
      }
    : { borderBottom: `1px solid ${borders.panelHeaderDivider}` }

  const leading =
    state.kind === 'running' ? (
      <RunSpinner data-testid="run-state-header-spinner" />
    ) : state.kind === 'idle' ? null : (
      <RunStatusDot
        data-testid="run-state-header-dot"
        shape="square"
        color={failed ? statusColors.failed : statusColors.ok}
      />
    )

  const title =
    state.kind === 'idle'
      ? 'Run'
      : state.kind === 'running'
        ? 'Running'
        : failed
          ? 'Run failed'
          : 'Completed'

  const meta =
    state.kind === 'idle'
      ? undefined
      : state.kind === 'running'
        ? formatRunMeta(state.runNumber)
        : formatRunMeta(state.runNumber, state.elapsed)

  return (
    <div
      data-testid="run-state-header"
      style={{
        height: px(layout.panelHeaderHeight),
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 14px',
        ...wash,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: px(8) }}>
        {leading}
        <div
          data-testid="run-state-header-title"
          style={{
            fontSize: px(12.5),
            fontWeight: fontWeights.semibold,
            color: failed ? runPanelColors.failedTitle : textColors.primary,
          }}
        >
          {title}
        </div>
        {state.kind !== 'idle' ? null : (
          <div
            data-testid="run-state-header-entry"
            style={{ fontFamily: fontFamilies.mono, fontSize: px(11.5), color: accent.cssVar }}
          >
            {props.entryNodeId}
          </div>
        )}
      </div>
      {meta === undefined ? null : (
        <div
          data-testid="run-state-header-meta"
          style={{
            fontFamily: fontFamilies.mono,
            fontSize: px(10),
            color: failed ? runPanelColors.failedMeta : textColors.typeAnnotation,
          }}
        >
          {meta}
        </div>
      )}
    </div>
  )
}
