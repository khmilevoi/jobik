import { type ReactNode, useId } from 'react'
import { fontFamilies, px, surfaces, tracking } from '../tokens.js'
import { canvasColors } from './canvasTokens.js'

export interface StripePlaceholderProps {
  readonly height: number
  readonly radius: number
  /** The centred mono caption, e.g. `image output`. Omitted by the cached treatment. */
  readonly label?: ReactNode
  /** `canvasMetrics.cachedOpacity` for the cached treatment. */
  readonly opacity?: number
  readonly 'data-testid'?: string
}

/** The 45° stripe field the artboards use wherever a rendered image would go. */
export function StripePlaceholder(props: StripePlaceholderProps) {
  const patternId = `jobik-stripe-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`
  return (
    <div
      data-testid={props['data-testid']}
      style={{
        height: px(props.height),
        borderRadius: px(props.radius),
        overflow: 'hidden',
        position: 'relative',
        background: surfaces.imagePlaceholder,
        opacity: props.opacity,
      }}
    >
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
            <rect width="8" height="8" fill={canvasColors.stripeBase} />
            <rect width="3" height="8" fill={canvasColors.stripeLine} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
      {props.label === undefined ? null : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: fontFamilies.mono,
            fontSize: px(10),
            letterSpacing: tracking.startTag,
            color: canvasColors.slotCaption,
          }}
        >
          {props.label}
        </div>
      )}
    </div>
  )
}
