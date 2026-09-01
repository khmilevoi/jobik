import { reatomComponent } from '@reatom/react'
import { cx } from '#cx.js'
import s from './Toggle.module.css'

export interface ToggleProps {
  readonly checked: boolean
  /** The track has no text of its own, so this is its whole accessible name. */
  readonly label: string
  readonly onChange?: (checked: boolean) => void
  readonly disabled?: boolean
  readonly className?: string
  readonly 'data-testid'?: string
}

/**
 * The Studio's toggle — `3C`'s `Bundle as zip`, and the design's only one.
 *
 * `role="switch"` rather than `checkbox`: the control is a two-state setting that takes effect at
 * once, which is what a switch is, and it is what the artboard draws — a pill, not a box.
 *
 * The off state is an extrapolation, not a drawing; see `Toggle.module.css`.
 */
export const Toggle = reatomComponent(function Toggle(props: ToggleProps) {
  const { checked, label, onChange } = props
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={props.disabled}
      onClick={onChange === undefined ? undefined : () => onChange(!checked)}
      data-testid={props['data-testid']}
      className={cx(s.track, !checked && s.off, props.className)}
    >
      <span className={cx(s.knob, !checked && s.knobOff)} />
    </button>
  )
}, 'Toggle')
