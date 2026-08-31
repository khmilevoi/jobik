import type { ReactNode } from 'react'
import { cx } from '../../cx.js'
import s from './Button.module.css'

export type ButtonVariant = 'quiet' | 'outlined' | 'accent'
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

interface ButtonCommonProps {
  readonly children: ReactNode
  /** The mono keyboard hint the accent/lg cell carries. Renders only when supplied. */
  readonly hint?: ReactNode
  readonly onClick?: () => void
  readonly disabled?: boolean
  readonly className?: string
  readonly 'aria-label'?: string
  readonly 'data-testid'?: string
}

/**
 * Only the seven (variant, size) cells the artboards contain are typed. A plan that needs an
 * eighth reports it as a gap rather than inventing its metrics.
 */
export type ButtonProps =
  | (ButtonCommonProps & { readonly variant: 'quiet'; readonly size: 'sm' | 'md' | 'lg' })
  | (ButtonCommonProps & { readonly variant: 'outlined'; readonly size: 'md' | 'lg' })
  | (ButtonCommonProps & { readonly variant: 'accent'; readonly size: 'xs' | 'lg' })

/** The seven cells, spelled out. `satisfies` makes a missing or invented cell a type error. */
type ButtonCell =
  | 'quiet:sm'
  | 'quiet:md'
  | 'quiet:lg'
  | 'outlined:md'
  | 'outlined:lg'
  | 'accent:xs'
  | 'accent:lg'

/**
 * The same table that used to hold a `CSSProperties` per cell, holding a class name per cell. The
 * keys are unchanged, so the cell a `(variant, size)` pair selects is still readable at a glance.
 *
 * Every value is a literal `s.<name>` read on purpose: `cssModuleUsage.test.ts` compares the reads
 * in this file against the classes `Button.module.css` defines, in both directions, and a computed
 * key would make a typo invisible to it.
 */
const cells = {
  'quiet:sm': s.quietSm,
  'quiet:md': s.quietMd,
  'quiet:lg': s.quietLg,
  'outlined:md': s.outlinedMd,
  'outlined:lg': s.outlinedLg,
  'accent:xs': s.accentXs,
  'accent:lg': s.accentLg,
} satisfies Record<ButtonCell, string>

/**
 * The table is two-axis and deliberately partial — there is no `outlined:sm` cell — so the switch
 * is what narrows `size` to the sizes that variant actually has. It costs three lines and buys the
 * lookup with no cast: an eighth cell cannot be selected without adding it above first.
 */
function cellClass(props: ButtonProps): string {
  switch (props.variant) {
    case 'quiet':
      return cells[`quiet:${props.size}`]
    case 'outlined':
      return cells[`outlined:${props.size}`]
    case 'accent':
      return cells[`accent:${props.size}`]
  }
}

export function Button(props: ButtonProps) {
  const { children, hint, onClick, disabled } = props
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={props['aria-label']}
      data-testid={props['data-testid']}
      className={cx(s.button, cellClass(props), props.className)}
    >
      {children}
      {hint === undefined ? null : <span className={s.hint}>{hint}</span>}
    </button>
  )
}
