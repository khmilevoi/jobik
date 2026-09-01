import { reatomComponent } from '@reatom/react'
import { cx } from '#cx.js'
import s from './Spinner.module.css'

/**
 * The four ring sizes `08-buttons.md` §1 draws, and the only four. Size follows the control it
 * sits in: 8 px in an inline mono link, 9 px in an h24 row button, 10 px in an h26 or 24 × 24
 * control, 11 px in an h34 or 26 × 26 control.
 */
export type SpinnerSize = 8 | 9 | 10 | 11

/**
 * The unlit ring behind the arc, at the two alphas the design draws: `soft` is `.22`, `wide` is
 * `.25`. Size decides it unless a caller says otherwise, and there is exactly one caller that
 * must — foundations §6-appendix gives the run panel's 9 px rings the wider track.
 */
export type SpinnerTrack = 'soft' | 'wide'

export interface SpinnerProps {
  readonly size?: SpinnerSize
  readonly track?: SpinnerTrack
  readonly className?: string
  readonly 'data-testid'?: string
}

/** Written out in full so a missing size is a type error and every read is one the gate can see. */
const sizes = {
  8: s.size8,
  9: s.size9,
  10: s.size10,
  11: s.size11,
} satisfies Record<SpinnerSize, string>

/** The appendix's rule, as a table: only the 11 px ring widens its track on size alone. */
const defaultTracks = {
  8: 'soft',
  9: 'soft',
  10: 'soft',
  11: 'wide',
} satisfies Record<SpinnerSize, SpinnerTrack>

/**
 * The Studio's in-button loader — the same ring `canvas`, `run` and `studio` each draw for their
 * own surfaces, as a primitive the button system can place.
 *
 * It is decorative and carries no accessible name: every control that shows it also swaps its
 * label to the working one (`Copying`, `Preparing`, `Collecting log`), and that label is what a
 * screen reader should read. A ring that announced itself would be read twice.
 *
 * **Activity is always the accent**, never the success or failure colour — `08-buttons.md` §1
 * states that as a rule, and it is why nothing here varies by state.
 */
export const Spinner = reatomComponent(function Spinner(props: SpinnerProps) {
  const { size = 10 } = props
  const track = props.track ?? defaultTracks[size]
  return (
    <span
      aria-hidden="true"
      data-testid={props['data-testid']}
      className={cx(s.spinner, sizes[size], track === 'wide' && s.trackWide, props.className)}
    />
  )
}, 'Spinner')
