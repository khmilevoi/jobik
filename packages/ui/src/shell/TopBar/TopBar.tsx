import type { ReactNode } from 'react'
import { cx } from '../../cx.js'
import { Badge, Button } from '../../primitives/index.js'
import s from './TopBar.module.css'

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
    <div data-testid="studio-dirty" className={cx(s.dirty, !compact && s.dirtyMarginLeft)}>
      <div data-testid="studio-dirty-dot" className={s.dirtyDot} />
      <div className={s.dirtyLabel}>{compact ? 'Unsaved' : 'Unsaved changes'}</div>
    </div>
  ) : null

  return (
    <div data-testid="studio-top-bar" className={cx(s.bar, compact && s.barCompact)}>
      <div className={s.wordmarkRow}>
        <div data-testid="studio-wordmark-square" className={s.wordmarkSquare} />
        <div className={s.wordmarkText}>jobik</div>
      </div>

      <div className={s.divider} />

      {dockedLeft}

      <div className={s.flowNameRow}>
        <div className={s.flowName}>{props.flowName}</div>
        {compact ? dirtyIndicator : <Badge>{props.flowFile}</Badge>}
      </div>

      {compact ? null : dirtyIndicator}

      {runningChip}

      <div className={s.spacer} />

      <div
        data-testid="studio-top-bar-actions"
        className={cx(s.actions, running && s.actionsRunning)}
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
