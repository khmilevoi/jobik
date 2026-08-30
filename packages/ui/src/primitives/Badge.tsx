import type { ReactNode } from 'react'
import { borders, fontFamilies, px, radii, textColors } from '../tokens.js'

export interface BadgeProps {
  readonly children: ReactNode
  readonly 'data-testid'?: string
}

/** The mono file badge beside the flow name, e.g. `flow.ts`. */
export function Badge(props: BadgeProps) {
  return (
    <div
      data-testid={props['data-testid']}
      style={{
        fontFamily: fontFamilies.mono,
        fontSize: px(10),
        color: textColors.badge,
        border: `1px solid ${borders.inset}`,
        borderRadius: px(radii.badge),
        padding: '2px 5px',
      }}
    >
      {props.children}
    </div>
  )
}
