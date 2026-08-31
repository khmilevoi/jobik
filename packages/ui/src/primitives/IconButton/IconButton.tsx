import type { ReactNode } from 'react'
import { cx, type StyleWithVars } from '#cx.js'
import type { ButtonState } from '#primitives/Button/Button.js'
import { CheckIcon } from '#primitives/icons/CheckIcon.js'
import { Spinner, type SpinnerSize } from '#primitives/Spinner/Spinner.js'
import s from './IconButton.module.css'

/** The two icon-only shapes `3A` draws: 24 × 24 for copy, 26 × 26 for download. */
export type IconButtonSize = 24 | 26

export interface IconButtonProps {
  /**
   * The button's whole accessible name, and its tooltip. `3A` labels the 24 × 24 shape
   * `24 × 24 · tooltip` and gives it `title="Copy"`; with no text in the box this is the only
   * thing a reader has, so it is required rather than optional.
   */
  readonly label: string
  /** Drawn only while idle — every other state owns the box. */
  readonly icon: ReactNode
  readonly size?: IconButtonSize
  readonly state?: ButtonState
  /** `0`–`100`. Draws the 2 px bar and the bare numeral. Only meaningful with `state="progress"`. */
  readonly progress?: number
  /**
   * The trailing chip `3A` §2.2 pairs with the copied state — mono `copied`, gap 8. Supplied by
   * the caller because the word is theirs; the chrome is not.
   */
  readonly chip?: ReactNode
  /** `3B` — the surface around this button reports the work. Implies `disabled`. */
  readonly dimmed?: boolean
  readonly onClick?: () => void
  readonly disabled?: boolean
  readonly className?: string
  readonly 'data-testid'?: string
}

const sizes = {
  24: s.size24,
  26: s.size26,
} satisfies Record<IconButtonSize, string>

/**
 * The ring and the check follow the box: 10 px in the 24 × 24, 11 px in the 26 × 26 — the same
 * step `08-buttons.md` §1 gives an h26 and an h34 control.
 */
const indicatorSizes = {
  24: 10,
  26: 11,
} satisfies Record<IconButtonSize, SpinnerSize>

/**
 * `idle` and `busy` add no class: 3A §2.2 draws the working cell as "same box, no colour", so the
 * ring is the entire difference and a class would be dead CSS.
 */
const states = {
  idle: '',
  busy: '',
  progress: s.progress,
  ok: s.ok,
  failed: s.failed,
} satisfies Record<ButtonState, string>

/**
 * The icon-only copy and download affordances — `3A`'s `Icon only` rows.
 *
 * The failed cell is the design's one non-SVG status glyph: foundations §7 lists `!` among the
 * characters used as text rather than drawn, so it is a character here too and not an invented
 * alert icon.
 */
export function IconButton(props: IconButtonProps) {
  const { label, icon, size = 24, state = 'idle', progress, chip, dimmed } = props
  const indicatorSize = indicatorSizes[size]

  const style: StyleWithVars = { '--jbk-icon-button-progress': `${progress ?? 0}%` }

  return (
    <span className={cx(s.wrap, props.className)}>
      <button
        type="button"
        title={label}
        aria-label={label}
        onClick={props.onClick}
        disabled={props.disabled === true || dimmed === true}
        data-testid={props['data-testid']}
        style={progress === undefined ? undefined : style}
        className={cx(s.iconButton, sizes[size], states[state], dimmed === true && s.dimmed)}
      >
        {state === 'progress' && progress !== undefined ? (
          <span aria-hidden="true" className={s.progressBar} />
        ) : null}
        {state === 'idle' ? icon : null}
        {state === 'busy' ? <Spinner size={indicatorSize} /> : null}
        {state === 'ok' ? <CheckIcon size={indicatorSize} /> : null}
        {state === 'failed' ? (
          <span aria-hidden="true" className={s.glyph}>
            !
          </span>
        ) : null}
        {state === 'progress' && progress !== undefined ? (
          <span className={s.percent}>{Math.round(progress)}</span>
        ) : null}
      </button>
      {chip === undefined ? null : <span className={s.chip}>{chip}</span>}
    </span>
  )
}
