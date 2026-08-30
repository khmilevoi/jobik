import { Button, Chip, chipStyle } from '../primitives/index.js'
import { accent, fontFamilies, px, textColors } from '../tokens.js'
import { Chevron } from './PanelHeader.js'

const labelStyle = { fontSize: px(11.5), color: textColors.controlLabel } as const

/**
 * The left panel docked into the top bar. One button wearing the chip box — it has no second
 * control inside it, so it can be the button itself.
 */
export function DockedFlowsControl(props: { readonly onExpand: () => void }) {
  return (
    <button
      type="button"
      aria-label="Expand flows and nodes"
      onClick={props.onExpand}
      style={chipStyle({ gap: 7 })}
    >
      <Chevron direction="right" />
      <div style={labelStyle}>Flows &amp; nodes</div>
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
        style={{ ...labelStyle, background: 'none', border: 'none', padding: 0 }}
      >
        Run{' '}
        <span style={{ fontFamily: fontFamilies.mono, color: accent.cssVar }}>
          {props.entryNodeId}
        </span>
      </button>
    </Chip>
  )
}
