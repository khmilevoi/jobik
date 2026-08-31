import type { ReactNode } from 'react'
import { cx } from '../../cx.js'
import { PanelHeader } from '../PanelHeader/PanelHeader.js'
import s from './RunDock.module.css'

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

/** Spelled out, not indexed by a computed key — see `cssModuleUsage.test.ts`. */
const metaTone = {
  normal: s.metaNormal,
  failed: s.metaFailed,
} satisfies Record<RunDockMetaTone, string>

export function RunDock(props: RunDockProps) {
  // `Studio — default` (264–273) and `Studio — run in progress` (586–591): the dock header's left
  // half carries the flow's entry point, unchanged by the run. Only the right slot moves.
  const title = (
    <div className={s.title}>
      <div className={s.titleLabel}>Run</div>
      <div className={s.titleEntry}>{props.entryNodeId}</div>
    </div>
  )

  return (
    <div data-testid="studio-dock" className={s.dock}>
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
        // design 586–593 shows no collapse control in a dock that carries a run number.
        <div data-testid="studio-dock-header" className={s.header}>
          {title}
          <div
            data-testid="studio-dock-run-meta"
            className={cx(s.meta, metaTone[props.runMetaTone ?? 'normal'])}
          >
            {props.runMeta}
          </div>
        </div>
      )}

      <div data-testid="studio-dock-body" className={s.body}>
        {props.children}
      </div>
    </div>
  )
}
