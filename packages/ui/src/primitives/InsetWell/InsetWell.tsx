import type { ReactNode } from 'react'
import { cx } from '../../cx.js'
import s from './InsetWell.module.css'

export type InsetWellVariant = 'control' | 'output'

export interface InsetWellProps {
  readonly variant?: InsetWellVariant
  readonly children: ReactNode
  /** Layout only — height, display, gap. Never a colour. */
  readonly className?: string
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
    >
      {props.children}
    </div>
  )
}
