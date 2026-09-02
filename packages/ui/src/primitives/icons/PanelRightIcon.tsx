import { reatomComponent } from '@reatom/react'
import type { IconProps } from './types.js'

/**
 * Foundations §7 — **Panel right**, 10 × 10, `stroke-width` `1.2`, `currentColor`. `Jobik Studio
 * Demo.dc.html`'s `toggleRight` button: the mirror of {@link PanelLeftIcon}, an 11×11 rounded-rect
 * frame with its right edge drawn at `4px` against `1.4px` on the other three.
 *
 * The same glyph opens and closes the run panel — the design toggles with one button, not one
 * icon per state — which is why `TopBar`'s right toggle button renders it regardless of
 * `rightCollapsed`.
 */
export const PanelRightIcon = reatomComponent(function PanelRightIcon(props: IconProps) {
  const { size = 10, strokeWidth = 1.2 } = props
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
      <rect
        x="1"
        y="1"
        width="8"
        height="8"
        rx="1.3"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
      />
      <rect x="6" y="1" width="3" height="8" rx="1.3" fill="currentColor" />
    </svg>
  )
}, 'PanelRightIcon')
