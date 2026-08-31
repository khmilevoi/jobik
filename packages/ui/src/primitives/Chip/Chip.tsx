import type { ReactNode } from 'react'
import { cx, type StyleWithVars } from '../../cx.js'
import { px } from '../../tokens.js'
import s from './Chip.module.css'

export type ChipTone = 'neutral' | 'accent'

export interface ChipStyleOptions {
  readonly tone?: ChipTone
  /** `7` on the docked flows control, `8` by default, `9` on the running chip. */
  readonly gap?: number
  /** A trailing control tightens the right padding from `10px` to `4px`. */
  readonly hasTrailing?: boolean
}

/** What a caller has to put on an element for it to be the chip box. */
export interface ChipBox {
  readonly className: string
  readonly style: StyleWithVars | undefined
}

/**
 * The chip box on its own, for the one caller that has to be a `<button>` rather than contain one.
 *
 * It returns a class name and, when the caller asked for a gap, the one custom property that
 * carries it — `gap` is a number the design draws three of rather than a variant it names, so it
 * cannot be a class. Spread both onto the element: `<button className={box.className}
 * style={box.style}>`.
 */
export function chipBox(options: ChipStyleOptions = {}): ChipBox {
  const { tone = 'neutral', gap, hasTrailing = false } = options
  return {
    className: cx(s.chip, tone === 'accent' && s.accent, hasTrailing && s.trailing),
    style: gap === undefined ? undefined : { '--jbk-chip-gap': px(gap) },
  }
}

export interface ChipProps extends Omit<ChipStyleOptions, 'hasTrailing'> {
  readonly leading?: ReactNode
  readonly children: ReactNode
  readonly trailing?: ReactNode
  readonly className?: string
  readonly 'data-testid'?: string
}

export function Chip(props: ChipProps) {
  const { tone, gap, leading, children, trailing } = props
  const box = chipBox({ tone, gap, hasTrailing: trailing !== undefined })
  return (
    <div
      data-testid={props['data-testid']}
      className={cx(box.className, props.className)}
      style={box.style}
    >
      {leading}
      {children}
      {trailing}
    </div>
  )
}
