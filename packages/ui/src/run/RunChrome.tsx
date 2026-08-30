import type { CSSProperties, ReactNode } from 'react'
import {
  accent,
  borders,
  fontFamilies,
  motion,
  px,
  radii,
  surfaces,
  textColors,
} from '../tokens.js'
import { runPanelColors, runPanelMetrics } from './runPanelTokens.js'

export function RunDivider(props: { readonly 'data-testid'?: string }) {
  return (
    <div
      data-testid={props['data-testid']}
      style={{ height: px(1), background: borders.inlineHairline }}
    />
  )
}

export type RunWellTone = 'neutral' | 'error'

export interface RunWellProps {
  /** `neutral` is `#1c1f22` on `#0c0e10`; `error` is `#2a1f1e` on `#0d0b0b`. */
  readonly tone?: RunWellTone
  /** Defaults to `10px` on `neutral` and `11px` on `error`. Layout only. */
  readonly padding?: string
  readonly children?: ReactNode
  /**
   * Layout and the typography of the well's own text — display, gap, font, size, line height, and a
   * colour taken from `tokens.ts` or `runPanelTokens.ts`. The stack block and the URL well both need
   * it. Never a literal colour.
   */
  readonly style?: CSSProperties
  readonly 'data-testid'?: string
}

const wellTones: Record<RunWellTone, { border: string; background: string; padding: string }> = {
  neutral: {
    border: borders.nodeHeaderDivider,
    background: surfaces.inputWell,
    padding: runPanelMetrics.wellPaddingBlock,
  },
  error: {
    border: runPanelColors.errorWellBorder,
    background: surfaces.failedErrorWell,
    padding: runPanelMetrics.wellPaddingError,
  },
}

/**
 * The run panel's well. P4's `InsetWell` has two variants and neither is this one: `control` is
 * `#212528` on `#0c0e10` at `9px 10px`, `output` is `#1e2124` on `#0a0b0c` at `8px`. Widening that
 * primitive is P4's; this plan reports the gap and builds its own.
 */
export function RunWell(props: RunWellProps) {
  const tone = wellTones[props.tone ?? 'neutral']
  return (
    <div
      data-testid={props['data-testid']}
      style={{
        border: `1px solid ${tone.border}`,
        borderRadius: px(radii.control),
        background: tone.background,
        padding: props.padding ?? tone.padding,
        ...props.style,
      }}
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
  readonly 'data-testid'?: string
}

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
      style={{
        width: '100%',
        height: px(runPanelMetrics.actionHeight),
        borderRadius: px(radii.control),
        border: `1px solid ${borders.secondaryButton}`,
        background: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: px(8),
        fontFamily: fontFamilies.ui,
        fontSize: px(12.5),
        fontWeight: props.weight ?? 400,
        color: runPanelColors.actionLabel,
      }}
    >
      {props.children}
      {props.hint === undefined ? null : (
        <span
          style={{
            fontFamily: fontFamilies.mono,
            fontSize: px(10),
            color: textColors.typeAnnotation,
          }}
        >
          {props.hint}
        </span>
      )}
    </button>
  )
}

export type RunDotShape = 'round' | 'hollow' | 'square'

export interface RunStatusDotProps {
  readonly shape: RunDotShape
  /** A `statusColors` value. Ignored by `hollow`, which paints its own border and no fill. */
  readonly color?: string
  readonly 'data-testid'?: string
}

export function RunStatusDot(props: RunStatusDotProps) {
  const size =
    props.shape === 'square' ? runPanelMetrics.squareDotSize : runPanelMetrics.statusDotSize
  const shape: CSSProperties =
    props.shape === 'square'
      ? { borderRadius: px(radii.kindDot), background: props.color }
      : props.shape === 'hollow'
        ? { borderRadius: radii.round, border: `1px solid ${runPanelColors.queuedDotBorder}` }
        : { borderRadius: radii.round, background: props.color }
  return (
    <div
      data-testid={props['data-testid']}
      style={{ width: px(size), height: px(size), flex: 'none', ...shape }}
    />
  )
}

export interface RunSpinnerProps {
  readonly 'data-testid'?: string
}

/** The 9px `.7s` ring the run panel uses in a state header and on the active node row. */
export function RunSpinner(props: RunSpinnerProps) {
  return (
    <div
      data-testid={props['data-testid']}
      style={{
        width: px(runPanelMetrics.spinnerSize),
        height: px(runPanelMetrics.spinnerSize),
        flex: 'none',
        borderRadius: radii.round,
        border: `${px(runPanelMetrics.spinnerBorderWidth)} solid ${runPanelColors.spinnerTrack}`,
        borderTopColor: accent.cssVar,
        animation: motion.spinner,
      }}
    />
  )
}
