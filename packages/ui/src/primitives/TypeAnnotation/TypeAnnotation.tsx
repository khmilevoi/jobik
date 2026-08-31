import type { ReactNode } from 'react'
import { cx } from '#cx.js'
import s from './TypeAnnotation.module.css'

export interface TypeAnnotationProps {
  readonly children: ReactNode
  readonly className?: string
  readonly 'data-testid'?: string
}

/** The mono type annotation beside a field name, e.g. `string`. */
export function TypeAnnotation(props: TypeAnnotationProps) {
  return (
    <div data-testid={props['data-testid']} className={cx(s.typeAnnotation, props.className)}>
      {props.children}
    </div>
  )
}
