import { reatomComponent } from '@reatom/react'
import type { ReactNode } from 'react'
import { cx } from '#cx.js'
import s from './Badge.module.css'

export interface BadgeProps {
  readonly children: ReactNode
  readonly className?: string
  readonly 'data-testid'?: string
}

/** The mono file badge beside the flow name, e.g. `flow.ts`. */
export const Badge = reatomComponent(function Badge(props: BadgeProps) {
  return (
    <div data-testid={props['data-testid']} className={cx(s.badge, props.className)}>
      {props.children}
    </div>
  )
}, 'Badge')
