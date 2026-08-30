import type { CSSProperties, ReactNode } from 'react'
import { fontFamilies, px, textColors, tracking } from '../tokens.js'

export interface SectionLabelProps {
  readonly children: ReactNode
  /** Defaults to the section-label step. The panel header passes `textColors.panelHeaderLabel`. */
  readonly color?: string
  /** Layout only — padding, width, flex. Never a colour or a font size. */
  readonly style?: CSSProperties
  readonly 'data-testid'?: string
}

export function SectionLabel(props: SectionLabelProps) {
  return (
    <div
      data-testid={props['data-testid']}
      style={{
        fontFamily: fontFamilies.mono,
        fontSize: px(9.5),
        letterSpacing: tracking.sectionLabel,
        textTransform: 'uppercase',
        color: props.color ?? textColors.sectionLabel,
        ...props.style,
      }}
    >
      {props.children}
    </div>
  )
}
