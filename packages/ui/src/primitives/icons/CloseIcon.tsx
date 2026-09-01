import { reatomComponent } from '@reatom/react'
import type { IconProps } from './types.js'

/**
 * Foundations §7 — **Close (×)**, 10 × 10, `stroke-width` `1.3`. The `3C` modal header's dismiss.
 *
 * It lives here rather than in the modal because it is one of the four icons the design draws, and
 * `08-buttons.md` is what fixes the borderless icon button that holds it.
 */
export const CloseIcon = reatomComponent(function CloseIcon(props: IconProps) {
  const { size = 10, strokeWidth = 1.3 } = props
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
        d="M1.4 1.4 8.6 8.6M8.6 1.4 1.4 8.6"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
      />
    </svg>
  )
}, 'CloseIcon')
