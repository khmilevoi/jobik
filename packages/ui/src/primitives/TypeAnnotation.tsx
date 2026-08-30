import type { ReactNode } from 'react'
import { fontFamilies, px, textColors } from '../tokens.js'

export interface TypeAnnotationProps {
  readonly children: ReactNode
  readonly 'data-testid'?: string
}

/** The mono type annotation beside a field name, e.g. `string`. */
export function TypeAnnotation(props: TypeAnnotationProps) {
  return (
    <div
      data-testid={props['data-testid']}
      style={{
        fontFamily: fontFamilies.mono,
        fontSize: px(10),
        color: textColors.typeAnnotation,
      }}
    >
      {props.children}
    </div>
  )
}
