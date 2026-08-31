import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../../cx.js'
import s from './InsetWell.module.css'

export type InsetWellVariant = 'control' | 'output'

export interface InsetWellProps {
  readonly variant?: InsetWellVariant
  readonly children: ReactNode
  /** Layout only — height, display, gap. Never a colour. */
  readonly className?: string
  /**
   * @deprecated Layout only, and only until the caller's own directory is migrated. Pass a
   * `className` from the caller's `*.module.css` instead; this prop goes away once nothing uses it.
   */
  readonly style?: CSSProperties
  readonly 'data-testid'?: string
}

/** Spelled out, not indexed by a computed key — see `cssModuleUsage.test.ts`. */
const variants = {
  control: s.control,
  output: s.output,
} satisfies Record<InsetWellVariant, string>

export function InsetWell(props: InsetWellProps) {
  return (
    <div
      data-testid={props['data-testid']}
      className={cx(s.well, variants[props.variant ?? 'control'], props.className)}
      style={props.style}
    >
      {props.children}
    </div>
  )
}
