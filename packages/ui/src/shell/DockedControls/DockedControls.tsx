import type { ReactNode } from 'react'
import { cx } from '#cx.js'
import { Button, Chip, chipBox } from '#primitives/index.js'
import { Chevron } from '#shell/PanelHeader/PanelHeader.js'
import s from './DockedControls.module.css'

/**
 * The left panel docked into the top bar. One button wearing the chip box — it has no second
 * control inside it, so it can be the button itself.
 */
export function DockedFlowsControl(props: { readonly onExpand: () => void }) {
  const box = chipBox({ gap: 7 })
  return (
    <button
      type="button"
      aria-label="Expand flows and nodes"
      onClick={props.onExpand}
      className={box.className}
      style={box.style}
    >
      <Chevron direction="right" />
      <div className={s.label}>Flows &amp; nodes</div>
    </button>
  )
}

export interface DockedRunControlProps {
  readonly entryNodeId: string
  /**
   * Expands the run dock. **Optional**, because `2A` draws this same pill in the top bar while the
   * dock is already open, where there is nothing to expand: the label is then inert text and the
   * accent `Run` chip is the only action in the group. Omit it for that form, pass it for
   * `panels collapsed`.
   */
  readonly onExpand?: () => void
  readonly onRun?: () => void
  /**
   * `3D` — *"Run is disabled while any error stands; warnings never block it."* `3B`'s dim is how
   * a blocked button looks: 45 % and unresponsive, with no loader and no label change.
   */
  readonly runBlocked?: boolean
}

/**
 * The run control in the top bar. `2A` and `panels collapsed` draw the identical box — 28px,
 * `padding:0 4px 0 10px`, `gap:8`, `#212528` on `#0e1012`, radius 5 — holding an `11.5px`
 * `#aeb5bb` `Run <entry>` label whose entry id is accent mono, and a 20px accent `Run` chip seated
 * flush right by that asymmetric padding.
 *
 * The label is a separate control from the chip, which is why the chip is a container rather than
 * a button.
 */
export function DockedRunControl(props: DockedRunControlProps) {
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
      {props.onExpand === undefined ? (
        <div data-testid="studio-run-control-label" className={s.label}>
          {label}
        </div>
      ) : (
        <button
          type="button"
          aria-label="Expand run panel"
          onClick={props.onExpand}
          className={cx(s.label, s.runButton)}
        >
          {label}
        </button>
      )}
    </Chip>
  )
}
