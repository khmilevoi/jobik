import { runPanelColors } from '../run/index.js'
import {
  accent,
  borders,
  fontFamilies,
  motion,
  px,
  radii,
  statusColors,
  textColors,
} from '../tokens.js'
import { studioColors, studioMetrics } from './studioTokens.js'

/**
 * `### Top bar`: during a run a chip takes the centre — spinner, `Running start1`, elapsed time and
 * an inline `Cancel`. P4 owns the slot (`TopBar`'s `runningChip: ReactNode`) and typed it as such;
 * no plan owned the chip's markup, so it is here.
 *
 * `SaveConflictChip` occupies the same slot when a save hit `FlowRevisionConflictError` (Ruling 6).
 * No artboard fixes a conflict treatment, so it invents no colour: every value below is already in
 * `tokens.ts` — `borders.secondaryButton` for its outline, `textColors.controlLabel` for its text,
 * `statusColors.unsaved` for its dot, the same `#8a7d4a` the unsaved indicator uses, because a
 * conflict *is* an unsaved state.
 */

const chipShell = {
  display: 'flex',
  alignItems: 'center',
  height: px(studioMetrics.chipHeight),
  borderRadius: px(radii.control),
  flex: 'none',
} as const

const inlineAction = {
  height: px(studioMetrics.chipActionHeight),
  padding: '0 8px',
  borderRadius: px(radii.badge),
  border: `1px solid ${borders.secondaryButton}`,
  background: 'none',
  display: 'flex',
  alignItems: 'center',
  fontFamily: fontFamilies.ui,
  fontSize: px(11),
  color: textColors.controlLabel,
  cursor: 'pointer',
} as const

export interface RunningChipProps {
  readonly startId: string
  /** Already formatted, e.g. `1.3s`. */
  readonly elapsed: string
  readonly onCancel?: () => void
}

export function RunningChip(props: RunningChipProps) {
  return (
    <div
      data-testid="studio-running-chip"
      style={{
        ...chipShell,
        gap: px(9),
        padding: '0 4px 0 10px',
        border: `1px solid ${studioColors.runningChipBorder}`,
        background: studioColors.runningChipFill,
      }}
    >
      <div
        data-testid="studio-running-spinner"
        style={{
          width: px(studioMetrics.chipSpinnerSize),
          height: px(studioMetrics.chipSpinnerSize),
          flex: 'none',
          borderRadius: radii.round,
          border: `${px(studioMetrics.chipSpinnerBorderWidth)} solid ${runPanelColors.spinnerTrack}`,
          borderTopColor: accent.cssVar,
          animation: motion.spinner,
        }}
      />
      <div style={{ fontSize: px(11.5), color: runPanelColors.actionLabel }}>
        Running{' '}
        <span
          data-testid="studio-running-start"
          style={{ fontFamily: fontFamilies.mono, color: accent.cssVar }}
        >
          {props.startId}
        </span>
      </div>
      <div
        data-testid="studio-running-elapsed"
        style={{ fontFamily: fontFamilies.mono, fontSize: px(10), color: textColors.muted }}
      >
        {props.elapsed}
      </div>
      <button
        type="button"
        data-testid="studio-running-cancel"
        onClick={props.onCancel}
        style={inlineAction}
      >
        Cancel
      </button>
    </div>
  )
}

export interface SaveConflictChipProps {
  readonly onReload?: () => void
  readonly onCopyDraft?: () => void
}

/**
 * `## UI and persistence`: *"If the file changed externally after load, save fails with
 * `FlowRevisionConflictError`; UI offers reload or copy-draft rather than overwriting."* There is
 * deliberately no third action — nothing here can overwrite the file.
 */
export function SaveConflictChip(props: SaveConflictChipProps) {
  return (
    <div
      data-testid="studio-conflict-chip"
      style={{
        ...chipShell,
        gap: px(8),
        padding: '0 4px 0 10px',
        border: `1px solid ${borders.secondaryButton}`,
        background: 'none',
      }}
    >
      <div
        style={{
          width: px(5),
          height: px(5),
          borderRadius: radii.round,
          background: statusColors.unsaved,
          flex: 'none',
        }}
      />
      <div style={{ fontSize: px(11.5), color: textColors.controlLabel }}>
        This flow changed on disk
      </div>
      <button
        type="button"
        data-testid="studio-conflict-reload"
        onClick={props.onReload}
        style={inlineAction}
      >
        Reload
      </button>
      <button
        type="button"
        data-testid="studio-conflict-copy"
        onClick={props.onCopyDraft}
        style={inlineAction}
      >
        Copy draft
      </button>
    </div>
  )
}
