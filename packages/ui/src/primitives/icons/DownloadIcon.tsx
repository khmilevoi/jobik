import type { IconProps } from './types.js'

/**
 * Foundations §7 — **Download**, 10 × 10, `stroke-width` `1.1` in a button and `1.2` in the `3C`
 * modal footer. One path: the shaft, the arrow head, and the base rule.
 */
export function DownloadIcon(props: IconProps) {
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
      <path
        d="M5 1v5.4M2.6 4.6 5 7l2.4-2.4M1.4 9h7.2"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </svg>
  )
}
