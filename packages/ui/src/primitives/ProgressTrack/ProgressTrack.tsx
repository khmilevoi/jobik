import { cx, type StyleWithVars } from '#cx.js'
import s from './ProgressTrack.module.css'

export interface ProgressTrackProps {
  /** `0`–`100`. There is no indeterminate form: a track with no number is a spinner's job. */
  readonly value: number
  /** Names what is progressing, for the progress bar's accessible name. */
  readonly label: string
  readonly className?: string
  readonly 'data-testid'?: string
}

/**
 * The standalone 2 px progress track — `3A` §3.4's transferring output row, where the filename
 * becomes a two-row column and this sits under it.
 *
 * It is a `progressbar` rather than a pair of divs because it is the only one of the design's
 * three determinate loaders that is not inside a button: a bar in a button is decorative, since
 * the button's own label already reads `Downloading 42%`, but this one carries the number alone.
 */
export function ProgressTrack(props: ProgressTrackProps) {
  const { value, label } = props
  const style: StyleWithVars = { '--jbk-progress-value': `${value}%` }
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      data-testid={props['data-testid']}
      className={cx(s.track, props.className)}
    >
      <div className={s.fill} style={style} />
    </div>
  )
}
