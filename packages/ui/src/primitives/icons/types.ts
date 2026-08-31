/**
 * The one shape every Studio icon takes.
 *
 * Foundations §7: every icon is inline SVG on a `viewBox="0 0 10 10"` grid, drawn with
 * `fill="none" stroke="currentColor"` and rendered at 9, 10 or 11 px. Colour therefore never
 * belongs to an icon — it inherits the `color` of whatever control holds it, which is what keeps
 * every state swap in `3A` down to one rule on the button.
 *
 * `strokeWidth` is a prop rather than a constant because the design draws three of the four icons
 * at more than one weight: the check is `1.4` at 10 and 11 px, `1.5` at 9 px in an inline mono
 * link and `1.6` inside the `3C` checkbox, and the download arrow is `1.1` in a button and `1.2`
 * in the modal footer. Each icon's own default is the weight the artboards use most.
 */
export interface IconProps {
  /** Rendered edge length in px. The viewBox never changes. Default 10. */
  readonly size?: number
  /** Overrides the icon's default weight for the contexts foundations §7 lists. */
  readonly strokeWidth?: number
  readonly className?: string
  readonly 'data-testid'?: string
}
