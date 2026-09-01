import { reatomComponent } from '@reatom/react'
import { type ReactNode, useId } from 'react'
import type { StyleWithVars } from '#cx.js'
import { px } from '#tokens.js'
import s from './StripePlaceholder.module.css'

export interface StripePlaceholderProps {
  readonly height: number
  readonly radius: number
  /** The centred mono caption, e.g. `image output`. Omitted by the cached treatment. */
  readonly label?: ReactNode
  /** `canvasMetrics.cachedOpacity` for the cached treatment. */
  readonly opacity?: number
  readonly 'data-testid'?: string
}

/**
 * The 45° stripe field the artboards use wherever a rendered image would go.
 *
 * A pure style primitive: its three numbers are the caller's own sizing, and there is nothing in
 * the model that could hand them over.
 */
export const StripePlaceholder = reatomComponent(function StripePlaceholder(
  props: StripePlaceholderProps,
) {
  const patternId = `jobik-stripe-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`
  // The three values a caller sizes this with, as the custom properties the rule reads. An absent
  // `opacity` leaves the property unset, so the rule falls back to `1` exactly as the inline style
  // used to leave `opacity` off altogether.
  const style: StyleWithVars = {
    '--jbk-stripe-height': px(props.height),
    '--jbk-stripe-radius': px(props.radius),
    ...(props.opacity === undefined ? {} : { '--jbk-stripe-opacity': props.opacity }),
  }
  return (
    <div data-testid={props['data-testid']} className={s.placeholder} style={style}>
      <svg width="100%" height="100%" role="presentation">
        <title>output placeholder</title>
        <defs>
          <pattern
            id={patternId}
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="8" height="8" className={s.base} />
            <rect width="3" height="8" className={s.line} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
      {props.label === undefined ? null : <div className={s.label}>{props.label}</div>}
    </div>
  )
}, 'StripePlaceholder')
