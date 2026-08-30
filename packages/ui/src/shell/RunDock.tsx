import type { ReactNode } from 'react'
import {
  accent,
  borders,
  fontFamilies,
  fontWeights,
  layout,
  px,
  surfaces,
  textColors,
} from '../tokens.js'
import { PanelHeader } from './PanelHeader.js'

export interface RunDockProps {
  readonly entryNodeId: string
  readonly onCollapse: () => void
  /**
   * The run panel's contents. P11 owns everything in here; the body's `16px 14px` padding and its
   * `16px` inter-block gap belong to this shell and must not be restated by the children.
   */
  readonly children?: ReactNode
}

export function RunDock(props: RunDockProps) {
  return (
    <div
      data-testid="studio-dock"
      style={{
        width: px(layout.rightDockWidth),
        flex: 'none',
        display: 'flex',
        flexDirection: 'column',
        background: surfaces.panel,
        borderLeft: `1px solid ${borders.shellDivider}`,
      }}
    >
      <PanelHeader chevron="right" collapseLabel="Collapse run panel" onCollapse={props.onCollapse}>
        <div style={{ display: 'flex', alignItems: 'center', gap: px(8) }}>
          <div
            style={{
              fontSize: px(12.5),
              fontWeight: fontWeights.semibold,
              color: textColors.primary,
            }}
          >
            Run
          </div>
          <div style={{ fontFamily: fontFamilies.mono, fontSize: px(11.5), color: accent.cssVar }}>
            {props.entryNodeId}
          </div>
        </div>
      </PanelHeader>

      <div
        data-testid="studio-dock-body"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '16px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: px(16),
        }}
      >
        {props.children}
      </div>
    </div>
  )
}
