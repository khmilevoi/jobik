import type { IconProps } from './types.js'

/**
 * Foundations §7 — **Chevron up**, 9 × 9, `stroke-width` `1.2`, `currentColor`. `2A`'s
 * `Show output` on the collapsed output dock.
 *
 * It is the one chevron in the design drawn in `currentColor`: the sidebar and run-dock collapse
 * chevrons hard-code `#7c848b`, which makes them shell chrome rather than an icon a control can
 * tint. Its grid is `0 0 9 9`, not the `0 0 10 10` the other four share, so its default size is 9.
 */
export function ChevronUpIcon(props: IconProps) {
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
}
