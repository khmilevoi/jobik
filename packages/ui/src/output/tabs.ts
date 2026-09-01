/**
 * The three tabs both output surfaces draw, in the order the design fixes.
 *
 * `06-output-viewer.md` §1.1 and `10-output-dock.md` §2.2 state the same rule twice: "Order is
 * always `Preview` · `Raw` · `Logs`". The standalone card and the `2A` dock share one header
 * component, so the list and its type live beside them rather than inside either.
 *
 * ## Why there is no `Trace`, and what would have to be true for there to be one
 *
 * Two newer statements name a third set. Artboard `4A`'s tab tile (design 113-115) labels its
 * three `Preview` · `Logs` · `Trace`, and the interactive prototype builds Trace out fully — a
 * per-node span bar chart whose widths grow as spans close. This package has no concept of it.
 *
 * That is deliberate, and it is the same ruling `DEFERRED.md` makes about per-node progress:
 * **nothing on the wire assembles span data.** A run report carries per-node `elapsedMs` and a
 * status, not start and end offsets against a run clock, so a Trace tab today could only draw bars
 * whose positions were invented. `4A`'s tile is a motion illustration whose labels are its own; the
 * two artboards that actually draw *this* strip — `2A` (design 1091-1094) and `Output viewer`
 * (design 2117-2120) — both name `Raw`, and `Raw` is what the package has.
 *
 * So this is a feature waiting on a span source, not a rename waiting on a decision. When the wire
 * carries span offsets, add the tab; until then, do not resurface the `4A` reading.
 */

export type OutputViewerTab = 'preview' | 'raw' | 'logs'

export interface OutputTabSpec {
  readonly id: OutputViewerTab
  readonly label: string
}

/** Verbatim from `07-copy.md` §10: `Preview`, `Raw`, `Logs`. */
export const OUTPUT_TABS: readonly OutputTabSpec[] = [
  { id: 'preview', label: 'Preview' },
  { id: 'raw', label: 'Raw' },
  { id: 'logs', label: 'Logs' },
]
