/**
 * The three tabs both output surfaces draw, in the order the design fixes.
 *
 * `06-output-viewer.md` §1.1 and `10-output-dock.md` §2.2 state the same rule twice: "Order is
 * always `Preview` · `Raw` · `Logs`". The standalone card and the `2A` dock share one header
 * component, so the list and its type live beside them rather than inside either.
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
