import { reatomComponent } from '@reatom/react'
import type { IconProps } from './types.js'

/**
 * Foundations §7 — **Chevron up**, 9 × 9, `stroke-width` `1.2`, `currentColor`. `2A`'s
 * `Show output` on the collapsed output dock.
 *
 * It is the one chevron *shape* in the set — `PanelLeftIcon` and `PanelRightIcon` draw a
 * different glyph for the sidebar and run-dock panel toggles, not a triangle. Its grid is
 * `0 0 9 9`, not the `0 0 10 10` the rest of the set shares, so its default size is 9.
 */
export const ChevronUpIcon = reatomComponent(function ChevronUpIcon(props: IconProps) {
  const { size = 9, strokeWidth = 1.2 } = props
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 9 9"
      aria-hidden="true"
      focusable="false"
      className={props.className}
      data-testid={props['data-testid']}
    >
      <path d="M1 6 4.5 2.5 8 6" fill="none" stroke="currentColor" strokeWidth={strokeWidth} />
    </svg>
  )
}, 'ChevronUpIcon')
