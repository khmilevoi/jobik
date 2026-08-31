/**
 * `Output viewer` artboard values, transcribed from `Jobik Studio.dc.html` (design lines 872–979).
 *
 * P4's `tokens.ts` owns everything the Studio shares and `canvas/canvasTokens.ts` owns what the
 * three canvas artboards add. This file owns only what the `Output viewer` artboard adds and
 * nothing else already defines. **Never re-declare a value another layer carries — import it.**
 * Every entry names the design line it came from.
 */

export const outputColors = {
  /** design 901 — the `n / m` badge scrim over the primary image: `surfaces.page` at `.72`. */
  badgeScrim: 'rgba(5,5,6,.72)',
  /** design 928 — the `no variant configured` label inside the dashed tile. */
  emptyVariantLabel: '#3f4549',
  /** `10-output-dock.md` §2.1 — the 38 × 2 grab bar on the dock's resize strip. */
  dockResizeHandle: '#1e2226',
} as const

export const outputMetrics = {
  /** design 881 — the tab bar. The shell's panel header is 38; this one is 40. */
  headerHeight: 40,
  headerPaddingX: 14,
  headerGap: 16,
  /** design 882 — between the three tab labels. */
  tabGap: 14,
  /** design 883 — the 1.5px accent underline under the active tab. */
  tabUnderlineWidth: 1.5,
  /** design 887 — the 1px rule between the tabs and the source field. */
  headerDividerHeight: 16,

  /** design 896 — the Preview body. */
  bodyPadding: 18,
  bodyGap: 18,

  /** design 897–907 — the left column. */
  primaryColumnWidth: 336,
  primaryColumnGap: 8,
  primaryImageHeight: 236,
  /** design 898 — the only radius the shared ramp does not carry. */
  primaryImageRadius: 6,
  /** design 901 — the `n / m` badge. */
  badgeInset: 8,
  badgeHeight: 18,
  badgePaddingX: 6,
  /** design 903 — the metadata row under the primary image. */
  metadataGap: 9,

  /** design 910–931 — the right column and its variant row. */
  rightColumnGap: 12,
  variantGap: 12,
  variantHeight: 112,
  variantCaptionGap: 7,
  /** design 928 — `no variant` / `configured` on two lines. */
  emptyVariantLineHeight: 1.6,

  /** design 936–947 — the `Typed values` block. */
  typedValuesGap: 8,
  typedValuesLabelWidth: 110,
  typedValuesRowGap: 8,
  typedValuesColumnGap: 14,

  /** design 963 — the Raw body. */
  rawPadding: 16,
  rawLineHeight: 1.75,

  /** design 634–639 — the `Live log` treatment the Logs tab reuses. */
  logGap: 5,
  logLineHeight: 1.5,

  /*
   * The `2A` output dock — `10-output-dock.md`. Everything the standalone card already fixes is
   * reused above; these are only the values the dock adds or changes.
   */
  /** §1 — the open dock's height, and the only height the design draws. */
  dockHeight: 378,
  /** §3 — the collapsed strip. */
  dockCollapsedHeight: 34,
  /** §2.1 — the 7px `ns-resize` strip and its 38 × 2 grab bar, radius 1. */
  dockHandleHeight: 7,
  dockHandleWidth: 38,
  dockHandleBarHeight: 2,
  /** Off the shared radius ramp (`8/7/5/4/3/2`), like the image frame's 6. */
  dockHandleRadius: 1,
  /** §2.2 — `padding:0 12px 0 14px`; the tabs keep the card's 14. */
  dockHeaderPaddingRight: 12,
  /** §2.2 — the gap inside the dismiss group, between the `esc` hint and the close button. */
  dockDismissGap: 7,
  /** §2.3 — the primary column, 372 where the card is 336. */
  dockPrimaryColumnWidth: 372,
  /** §2.3 — the right column, 14 where the card is 12. */
  dockRightColumnGap: 14,
  /** §3 — the collapsed strip's own gap, and the gap inside its `Show output` button. */
  dockStripGap: 12,
} as const
