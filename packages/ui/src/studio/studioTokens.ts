/**
 * Studio-only design values, transcribed from `Jobik Studio.dc.html`.
 *
 * `tokens.ts` owns everything the Studio shares and `runPanelTokens.ts` owns the run dock's own
 * values. **Never re-declare a value either of those already carries — import it.** `Studio — run
 * in progress` (design lines 473–479), the running chip's container:
 * `border:1px solid rgba(31,214,189,.3); ... background:rgba(31,214,189,.06)`. That exact pair is
 * already `accent.chipBorder`/`accent.chipFill` in `tokens.ts` — the `Chip` primitive's own accent
 * tone — so they are re-exported here under the chip's own name rather than re-declared as new
 * literals; neither is actually new.
 */
import { accent } from '#tokens.js'

export const studioColors = {
  /** `Studio — run in progress` (474): the running chip's outline — `accent.chipBorder`. */
  runningChipBorder: accent.chipBorder,
  /** `Studio — run in progress` (474): the running chip's fill — `accent.chipFill`. */
  runningChipFill: accent.chipFill,
} as const

export const studioMetrics = {
  /** `Studio — run in progress` (473): `height:28px`. Also the collapsed docked-control height. */
  chipHeight: 28,
  /** `Studio — run in progress` (479): the inline `Cancel` cell, `height:20px`. */
  chipActionHeight: 20,
} as const
