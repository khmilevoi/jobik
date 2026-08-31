import type { ReactNode } from 'react'
// Token-only, and deliberately not through `../run/index.js`: the dock needs one colour the failed
// run panel owns, not the run panel's component tree.
import { runPanelColors } from '../run/runPanelTokens.js'
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

/** `Run panel — states`: the failed card's meta is its own `#6d5f5c` (design 801); the running and
 *  completed ones are the neutral `#5d656c` (777, 838). */
export type RunDockMetaTone = 'normal' | 'failed'

export interface RunDockProps {
  readonly entryNodeId: string
  readonly onCollapse: () => void
  /**
   * The run number, once a run exists: `#219` while in flight (`Studio — run in progress`, design
   * 592) and `#220 · 0.8s` / `#221 · 2.4s` once settled (`Run panel — states`, 801 and 838).
   *
   * While it is set the 22×22 chevron gives way to it and the header's asymmetric
   * `0 10px 0 14px` — which exists only to seat that button — becomes symmetric `0 14px`. That
   * closes closeout finding 8-A: `RunStateHeader` drew all three of these headers for the
   * standalone card and nothing ever mounted it in the dock, so the run number reached no run
   * state at all.
   */
  readonly runMeta?: string
  readonly runMetaTone?: RunDockMetaTone
  /**
   * The run panel's contents. P11 owns everything in here; the body's `16px 14px` padding and its
   * `16px` inter-block gap belong to this shell and must not be restated by the children. This is
   * also still the dock's ONE header: a child must not draw a second one.
   */
  readonly children?: ReactNode
}

export function RunDock(props: RunDockProps) {
  // `Studio — default` (264–273) and `Studio — run in progress` (586–591): the dock header's left
  // half carries the flow's entry point, unchanged by the run. Only the right slot moves.
  const title = (
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
  )

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
      {props.runMeta === undefined ? (
        <PanelHeader
          data-testid="studio-dock-header"
          chevron="right"
          collapseLabel="Collapse run panel"
          onCollapse={props.onCollapse}
        >
          {title}
        </PanelHeader>
      ) : (
        // The same 38px bar `PanelHeader` draws, without its chevron button: design 586–593 shows
        // no collapse control in a dock that carries a run number, and `PanelHeader` always draws
        // one. Everything else — height, divider, layout — is the same header.
        <div
          data-testid="studio-dock-header"
          style={{
            height: px(layout.panelHeaderHeight),
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 14px',
            borderBottom: `1px solid ${borders.panelHeaderDivider}`,
          }}
        >
          {title}
          <div
            data-testid="studio-dock-run-meta"
            style={{
              fontFamily: fontFamilies.mono,
              fontSize: px(10),
              color:
                props.runMetaTone === 'failed'
                  ? runPanelColors.failedMeta
                  : textColors.typeAnnotation,
            }}
          >
            {props.runMeta}
          </div>
        </div>
      )}

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
