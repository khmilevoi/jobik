import type { ReactNode } from 'react'
import { cx, type StyleWithVars } from '#cx.js'
import { Spinner } from '#primitives/Spinner/Spinner.js'
import s from './RunChrome.module.css'

export interface RunDividerProps {
  readonly className?: string
  readonly 'data-testid'?: string
}

export function RunDivider(props: RunDividerProps) {
  return <div data-testid={props['data-testid']} className={cx(s.divider, props.className)} />
}

export type RunWellTone = 'neutral' | 'error'

export interface RunWellProps {
  /** `neutral` is `#1c1f22` on `#0c0e10`; `error` is `#2a1f1e` on `#0d0b0b`. */
  readonly tone?: RunWellTone
  /** Defaults to `10px` on `neutral` and `11px` on `error`. Layout only. */
  readonly padding?: string
  readonly children?: ReactNode
  /**
   * Layout and the typography of the well's own text — display, gap, font, size, line height and a
   * colour taken from a token. The stack block and the URL well both need it. Never a literal
   * colour.
   */
  readonly className?: string
  readonly 'data-testid'?: string
}

/** Spelled out, not indexed by a computed key — see `cssModuleUsage.test.ts`. */
const wellTones = {
  neutral: s.wellNeutral,
  error: s.wellError,
} satisfies Record<RunWellTone, string>

/**
 * The run panel's well. P4's `InsetWell` has two variants and neither is this one: `control` is
 * `#212528` on `#0c0e10` at `9px 10px`, `output` is `#1e2124` on `#0a0b0c` at `8px`. Widening that
 * primitive is P4's; this plan reports the gap and builds its own.
 */
export function RunWell(props: RunWellProps) {
  // `padding` is a value the stylesheet cannot know, so it rides in as the custom property the
  // tone rules already read, exactly the way `SectionLabel` carries its `color`.
  const style: StyleWithVars | undefined =
    props.padding === undefined ? undefined : { '--jbk-run-well-padding': props.padding }
  return (
    <div
      data-testid={props['data-testid']}
      className={cx(s.well, wellTones[props.tone ?? 'neutral'], props.className)}
      style={style}
    >
      {props.children}
    </div>
  )
}

export interface RunActionProps {
  readonly children: ReactNode
  /** The mono keyboard hint, e.g. `esc`. Rendered, never bound — key handling is P14's. */
  readonly hint?: ReactNode
  /** `500` on `Cancel run`, `400` on `Copy log`. */
  readonly weight?: 400 | 500
  readonly onClick?: () => void
  readonly className?: string
  readonly 'data-testid'?: string
}

/** Both weights spelled out; `satisfies` makes a third one a type error rather than a silent miss. */
const actionWeights = {
  400: s.actionRegular,
  500: s.actionMedium,
} satisfies Record<NonNullable<RunActionProps['weight']>, string>

/**
 * The 34px outlined action. P4's `Button` types seven `(variant, size)` cells and none is this one:
 * `outlined:lg` is `6px 14px` on a `#16181a` fill with a `#2c3033` border and a hint in
 * `rgba(4,33,29,.6)`. An eighth cell is P4's to add; this plan reports the gap.
 */
export function RunAction(props: RunActionProps) {
  return (
    <button
      type="button"
      data-testid={props['data-testid']}
      onClick={props.onClick}
      className={cx(s.action, actionWeights[props.weight ?? 400], props.className)}
    >
      {props.children}
      {props.hint === undefined ? null : <span className={s.hint}>{props.hint}</span>}
    </button>
  )
}

export type RunDotShape = 'round' | 'hollow' | 'square'

/**
 * The three fills a dot can carry. `ok` and `failed` are `statusColors`; `cached` is the `Node
 * states` card's `#4a5157` (design 747), which together with the `cached · 0.0s` label is the
 * whole of what distinguishes a cached node from a freshly computed one.
 */
export type RunDotTone = 'ok' | 'failed' | 'cached'

export interface RunStatusDotProps {
  readonly shape: RunDotShape
  /** Ignored by `hollow`, which paints its own border and no fill. */
  readonly tone?: RunDotTone
  /**
   * A `statusColors` value, for a caller outside this package that has no stylesheet of its own.
   * Sets the same custom property `tone` does, inline, so it wins over it. Ignored by `hollow`.
   */
  readonly color?: string
  readonly className?: string
  readonly 'data-testid'?: string
}

const dotShapes = {
  round: s.round,
  hollow: s.hollow,
  square: s.square,
} satisfies Record<RunDotShape, string>

const dotTones = {
  ok: s.toneOk,
  failed: s.toneFailed,
  cached: s.toneCached,
} satisfies Record<RunDotTone, string>

export function RunStatusDot(props: RunStatusDotProps) {
  const { tone, color } = props
  const style: StyleWithVars | undefined =
    color === undefined ? undefined : { '--jbk-run-dot-color': color }
  return (
    <div
      data-testid={props['data-testid']}
      className={cx(
        s.dot,
        dotShapes[props.shape],
        tone === undefined ? undefined : dotTones[tone],
        props.className,
      )}
      style={style}
    />
  )
}

export interface RunSpinnerProps {
  readonly className?: string
  readonly 'data-testid'?: string
}

/**
 * The 9px `.7s` ring the run panel uses in a state header and on the active node row.
 *
 * `primitives/Spinner` is the ring itself now; this stays as the run panel's name for it, and as
 * the one place that knows the panel takes the wider `.25` track at 9px — foundations
 * §6-appendix's single exception to track-follows-size.
 */
export function RunSpinner(props: RunSpinnerProps) {
  return (
    <Spinner size={9} track="wide" data-testid={props['data-testid']} className={props.className} />
  )
}
