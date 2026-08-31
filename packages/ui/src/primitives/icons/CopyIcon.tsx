import type { IconProps } from './types.js'

/**
 * Foundations §7 — **Copy**, 10 × 10, `stroke-width` `1.1`. Two shapes: the back sheet as a
 * rounded rect and the front sheet as an open path, so the overlap reads without a fill.
 *
 * `aria-hidden` on purpose: every control that draws this icon carries its own accessible name —
 * the toolbar button's label, the icon button's `aria-label`. A second name here would be read
 * twice.
 */
export function CopyIcon(props: IconProps) {
  const { size = 10, strokeWidth = 1.1 } = props
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
        width="6"
        height="6"
        rx="1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
      />
      <path
        d="M3.4 9h5a.6.6 0 0 0 .6-.6V3.4"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
      />
    </svg>
  )
}
