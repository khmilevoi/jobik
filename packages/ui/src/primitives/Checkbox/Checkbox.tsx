import type { ChangeEvent } from 'react'
import { cx } from '#cx.js'
import { CheckIcon } from '#primitives/icons/CheckIcon.js'
import s from './Checkbox.module.css'

export interface CheckboxProps {
  readonly checked: boolean
  /** The box has no text of its own, so this is its whole accessible name. */
  readonly label: string
  readonly onChange?: (checked: boolean) => void
  readonly disabled?: boolean
  /**
   * Put on the real input, so an outer `<label htmlFor>` can name a click target wider than the
   * 14 px box — `3C`'s download row makes the whole 46 px row clickable that way.
   */
  readonly id?: string
  readonly className?: string
  readonly 'data-testid'?: string
}

/**
 * The Studio's checkbox — `3C`'s Download-output file rows, and the design's only one.
 *
 * The design draws a 14 px box with a 9 px check and no native chrome at all, so the real
 * `<input>` is present but not painted — it is stretched over the whole box instead, which is what
 * makes the box itself the hit target. That keeps every behaviour a checkbox is expected to have —
 * space to toggle, form participation, the right thing announced — while the appearance is
 * entirely the stylesheet's.
 *
 * The root is a `<span>`, not a `<label>`, and that is load-bearing: `3C`'s download row makes the
 * whole 46 px file row the label, and a label inside a label is invalid. As a span this nests
 * cleanly and the outer label still forwards a click on any part of the row to the input.
 *
 * The check is drawn at `stroke-width` 1.6: foundations §7 lists that weight for exactly one
 * context, and this box is it.
 */
export function Checkbox(props: CheckboxProps) {
  const { checked, label, onChange } = props
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange?.(event.target.checked)
  }
  return (
    <span className={cx(s.box, checked && s.checked, props.className)}>
      <input
        type="checkbox"
        id={props.id}
        className={s.input}
        checked={checked}
        disabled={props.disabled}
        aria-label={label}
        onChange={handleChange}
        data-testid={props['data-testid']}
      />
      {checked ? <CheckIcon size={9} strokeWidth={1.6} /> : null}
    </span>
  )
}
