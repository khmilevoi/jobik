import { useId } from 'react'
import { cx } from '#cx.js'
import s from './SegmentedControl.module.css'

export interface SegmentedControlOption<T extends string> {
  readonly value: T
  readonly label: string
}

export interface SegmentedControlProps<T extends string> {
  readonly options: readonly SegmentedControlOption<T>[]
  readonly value: T
  readonly onChange?: (value: T) => void
  /** Names the group — `Format` in `3C`. The visible label sits outside the track. */
  readonly label: string
  readonly disabled?: boolean
  readonly className?: string
  readonly 'data-testid'?: string
}

/**
 * The Studio's segmented control — `3C`'s `Format` selector, and the design's only one.
 *
 * A radio group rather than a tab list: the options choose a value the modal will act on, not a
 * panel to show. Each option is a real radio inside its own `<label>` pill, unpainted the same way
 * the checkbox's input is, so arrow-key navigation and "2 of 3" come from the browser rather than
 * from a roving `tabindex` this component would have to maintain. `useId` gives the group its
 * `name`, so two segmented controls on one page never capture each other's presses.
 *
 * Generic over the option's own union, so a caller writing `'png' | 'webp' | 'jpg'` gets that back
 * from `onChange` rather than a bare `string`.
 */
export function SegmentedControl<T extends string>(props: SegmentedControlProps<T>) {
  const { options, value, onChange, label } = props
  const name = useId()
  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-testid={props['data-testid']}
      className={cx(s.track, props.className)}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <label key={option.value} className={cx(s.option, selected && s.selected)}>
            <input
              type="radio"
              name={name}
              className={s.input}
              checked={selected}
              disabled={props.disabled}
              onChange={() => onChange?.(option.value)}
            />
            {option.label}
          </label>
        )
      })}
    </div>
  )
}
