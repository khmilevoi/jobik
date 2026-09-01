import { reatomComponent } from '@reatom/react'
import type { IconProps } from './types.js'

/**
 * Foundations §7 — **Check**, one 10 × 10 path drawn at 9, 10 and 11 px.
 *
 * `stroke-width` by context, all from the same viewBox: `1.4` at 10 and 11 px, `1.5` at 9 px in an
 * inline mono link, `1.6` at 9 px inside the `3C` accent checkbox. The default is the button
 * weight.
 */
export const CheckIcon = reatomComponent(function CheckIcon(props: IconProps) {
  const { size = 10, strokeWidth = 1.4 } = props
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 10 10"
      aria-hidden="true"
      focusable="false"
      className={props.className}
      data-testid={props['data-testid']}
    >
      <path
        d="M1.6 5.2 4 7.6 8.6 2.4"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  )
}, 'CheckIcon')
