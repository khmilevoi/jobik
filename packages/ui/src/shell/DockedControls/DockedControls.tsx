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
  readonly onExpand: () => void
  readonly onRun?: () => void
}

/**
 * The run dock docked into the top bar. The label region expands the dock; the accent `Run` beside
 * it is a separate button, which is why the chip is a container rather than a button.
 */
export function DockedRunControl(props: DockedRunControlProps) {
  return (
    <Chip
      data-testid="studio-docked-run"
      gap={8}
      trailing={
        <Button variant="accent" size="xs" onClick={props.onRun}>
          Run
        </Button>
      }
    >
      <button
        type="button"
        aria-label="Expand run panel"
        onClick={props.onExpand}
        className={cx(s.label, s.runButton)}
      >
        Run <span className={s.runEntry}>{props.entryNodeId}</span>
      </button>
    </Chip>
  )
}
