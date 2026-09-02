import { reatomComponent } from '@reatom/react'
import type { ReactNode } from 'react'
import { cx } from '#cx.js'
import s from './PanelHeader.module.css'

export interface PanelHeaderProps {
  readonly children: ReactNode
  /**
   * A caller-owned modifier — `RunDock` uses it for the failed run's tinted bar
   * (`s.headerFailed`). Merged onto the header's own box, never replacing it.
   */
  readonly className?: string
  readonly 'data-testid'?: string
}

/**
 * Shared panel-header chrome: height, bottom divider, and a `space-between` row for whatever the
 * caller lays inside it.
 *
 * It used to also draw the collapse/expand button (`PanelLeftIcon`/`PanelRightIcon`) that sat at
 * the row's trailing edge. That control moved to `TopBar` — see `Studio`'s `leftCollapsed` /
 * `rightCollapsed` wiring — because the Demo prototype (`Jobik Studio Demo.dc.html`, the one live
 * artboard for this) seats both toggles in the top bar itself, always present, rather than inside
 * each panel's own header. `Jobik Studio.dc.html`'s `2A` / `panels collapsed` artboards, cited by
 * this file's previous revision for the in-panel button, are no longer verifiable against the
 * design project (it currently holds only `4A`/`3A`) — see root `CLAUDE.md`.
 */
export const PanelHeader = reatomComponent(function PanelHeader(props: PanelHeaderProps) {
  return (
    <div data-testid={props['data-testid']} className={cx(s.header, props.className)}>
      {props.children}
    </div>
  )
}, 'PanelHeader')
