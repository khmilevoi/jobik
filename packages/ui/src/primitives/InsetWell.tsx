import type { CSSProperties, ReactNode } from 'react'
import { borders, px, radii, surfaces } from '../tokens.js'

export type InsetWellVariant = 'control' | 'output'

export interface InsetWellProps {
  readonly variant?: InsetWellVariant
  readonly children: ReactNode
  /** Layout only — height, display, gap. Never a colour. */
  readonly style?: CSSProperties
  readonly 'data-testid'?: string
}

const variants: Record<InsetWellVariant, CSSProperties> = {
  control: {
    border: `1px solid ${borders.quietControl}`,
    background: surfaces.inputWell,
    padding: '9px 10px',
  },
  output: {
    border: `1px solid ${borders.inset}`,
    background: surfaces.outputWell,
    padding: '8px',
  },
}

export function InsetWell(props: InsetWellProps) {
  return (
    <div
      data-testid={props['data-testid']}
      style={{
        borderRadius: px(radii.control),
        ...variants[props.variant ?? 'control'],
        ...props.style,
      }}
    >
      {props.children}
    </div>
  )
}
