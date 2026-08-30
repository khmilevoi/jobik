import type { CSSProperties, ReactNode } from 'react'
import { accent, borders, fontFamilies, layout, px, radii, surfaces } from '../tokens.js'

export type ChipTone = 'neutral' | 'accent'

export interface ChipStyleOptions {
  readonly tone?: ChipTone
  /** `7` on the docked flows control, `8` by default, `9` on the running chip. */
  readonly gap?: number
  /** A trailing control tightens the right padding from `10px` to `4px`. */
  readonly hasTrailing?: boolean
}

/**
 * The chip box on its own, for the one caller that has to be a `<button>` rather than contain one.
 */
export function chipStyle(options: ChipStyleOptions = {}): CSSProperties {
  const { tone = 'neutral', gap = 8, hasTrailing = false } = options
  return {
    display: 'flex',
    alignItems: 'center',
    height: px(layout.chipHeight),
    padding: hasTrailing ? '0 4px 0 10px' : '0 10px',
    gap: px(gap),
    borderRadius: px(radii.control),
    border: `1px solid ${tone === 'accent' ? accent.chipBorder : borders.quietControl}`,
    background: tone === 'accent' ? accent.chipFill : surfaces.dockedControl,
    fontFamily: fontFamilies.ui,
  }
}

export interface ChipProps extends Omit<ChipStyleOptions, 'hasTrailing'> {
  readonly leading?: ReactNode
  readonly children: ReactNode
  readonly trailing?: ReactNode
  readonly 'data-testid'?: string
}

export function Chip(props: ChipProps) {
  const { tone, gap, leading, children, trailing } = props
  return (
    <div
      data-testid={props['data-testid']}
      style={chipStyle({ tone, gap, hasTrailing: trailing !== undefined })}
    >
      {leading}
      {children}
      {trailing}
    </div>
  )
}
