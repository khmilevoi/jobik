import type { ReactNode } from 'react'
import { Badge, Button } from '../primitives/index.js'
import {
  accent,
  borders,
  fontWeights,
  layout,
  px,
  radii,
  statusColors,
  surfaces,
  textColors,
  tracking,
} from '../tokens.js'

export interface TopBarProps {
  readonly flowName: string
  /** The mono file badge, e.g. `flow.ts`. Hidden while the bar is compact. */
  readonly flowFile: string
  readonly dirty: boolean
  /** Dims and disables `Validate` and `Save`. */
  readonly running?: boolean
  /**
   * The centre slot the running chip occupies. P4 owns the slot; the chip's own markup is not in
   * any plan's scope yet and is reported as a gap.
   */
  readonly runningChip?: ReactNode
  /** The docked `Flows & nodes` control, present only while the left panel is collapsed. */
  readonly dockedLeft?: ReactNode
  /** The docked `Run <entry>` control, present only while the right dock is collapsed. */
  readonly dockedRight?: ReactNode
  readonly onValidate?: () => void
  readonly onSave?: () => void
}

export function TopBar(props: TopBarProps) {
  const { dockedLeft, dockedRight, runningChip, running = false } = props
  const compact = dockedLeft !== undefined || dockedRight !== undefined || runningChip !== undefined

  const dirtyIndicator = props.dirty ? (
    <div
      data-testid="studio-dirty"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: px(6),
        ...(compact ? {} : { marginLeft: px(2) }),
      }}
    >
      <div
        data-testid="studio-dirty-dot"
        style={{
          width: px(5),
          height: px(5),
          borderRadius: radii.round,
          background: statusColors.unsaved,
        }}
      />
      <div style={{ fontSize: px(11), color: textColors.chevron }}>
        {compact ? 'Unsaved' : 'Unsaved changes'}
      </div>
    </div>
  ) : null

  return (
    <div
      data-testid="studio-top-bar"
      style={{
        height: px(layout.topBarHeight),
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: px(compact ? 14 : 16),
        background: surfaces.topBar,
        borderBottom: `1px solid ${borders.shellDivider}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: px(8) }}>
        <div
          data-testid="studio-wordmark-square"
          style={{
            width: px(14),
            height: px(14),
            borderRadius: px(radii.badge),
            border: `1.5px solid ${accent.cssVar}`,
          }}
        />
        <div
          style={{
            fontSize: px(14),
            fontWeight: fontWeights.semibold,
            color: textColors.primary,
            letterSpacing: tracking.wide,
          }}
        >
          jobik
        </div>
      </div>

      <div style={{ width: px(1), height: px(18), background: borders.inset }} />

      {dockedLeft}

      <div style={{ display: 'flex', alignItems: 'center', gap: px(10) }}>
        <div
          style={{
            fontSize: px(13),
            fontWeight: fontWeights.medium,
            color: textColors.activeIdentifier,
          }}
        >
          {props.flowName}
        </div>
        {compact ? dirtyIndicator : <Badge>{props.flowFile}</Badge>}
      </div>

      {compact ? null : dirtyIndicator}

      {runningChip}

      <div style={{ flex: 1 }} />

      <div
        data-testid="studio-top-bar-actions"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: px(8),
          opacity: running ? 0.45 : 1,
        }}
      >
        {dockedRight}
        <Button variant="quiet" size="lg" onClick={props.onValidate} disabled={running}>
          Validate
        </Button>
        <Button variant="outlined" size="lg" onClick={props.onSave} disabled={running}>
          Save
        </Button>
      </div>
    </div>
  )
}
