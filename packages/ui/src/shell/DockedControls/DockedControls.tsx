import { reatomComponent } from '@reatom/react'
import type { ReactNode } from 'react'
import { Button, Chip } from '#primitives/index.js'
import s from './DockedControls.module.css'

export interface DockedRunControlProps {
  readonly entryNodeId: string
  readonly onRun?: () => void
  /**
   * `3D` — *"Run is disabled while any error stands; warnings never block it."* `3B`'s dim is how
   * a blocked button looks: 45 % and unresponsive, with no loader and no label change.
   */
  readonly runBlocked?: boolean
}

/**
 * The run affordance in the top bar, present while the run dock is open (`2A`,
 * `Studio — run in progress`). `28px, padding:0 4px 0 10px, gap:8, #212528` on `#0e1012`, radius
 * 5 — a `11.5px` `#aeb5bb` `Run <entry>` label whose entry id is accent mono, and a 20px accent
 * `Run` chip seated flush right by that asymmetric padding.
 *
 * It used to double as the right panel's own expand affordance while the dock was collapsed (an
 * `onExpand` prop drove a second, button-shaped rendering of this same label). That collapsed
 * form is gone: the Demo prototype (`Jobik Studio Demo.dc.html`) puts panel expand/collapse
 * solely on a dedicated top-bar toggle button (see `TopBar`'s `onToggleRight`), so this control
 * is now always the plain label — inert text beside the one thing that actually acts, the accent
 * `Run` chip.
 */
export const DockedRunControl = reatomComponent(function DockedRunControl(
  props: DockedRunControlProps,
) {
  const label: ReactNode = (
    <>
      Run <span className={s.runEntry}>{props.entryNodeId}</span>
    </>
  )
  return (
    <Chip
      data-testid="studio-docked-run"
      gap={8}
      trailing={
        <Button variant="accent" size="xs" onClick={props.onRun} dimmed={props.runBlocked}>
          Run
        </Button>
      }
    >
      <div data-testid="studio-run-control-label" className={s.label}>
        {label}
      </div>
    </Chip>
  )
}, 'DockedRunControl')
