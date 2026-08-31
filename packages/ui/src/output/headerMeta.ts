import { formatBytes } from '#output/format.js'
import type { OutputLogLine } from '#output/LogLines/LogLines.js'
import type { OutputViewerTab } from '#output/tabs.js'

/**
 * The header's right-hand mono readout, which the design states per tab.
 *
 * `06-output-viewer.md` §2.1 puts `json · 1.4 kb` there on the `Raw` card; `Preview` shows nothing,
 * because the context line already occupies that information slot; and `Logs` is never drawn
 * selected in any artboard, so it reuses the same slot for a line count.
 *
 * Both output surfaces share it, so it is a plain module beside them rather than a private
 * function inside either.
 */
export function outputHeaderMeta(
  tab: OutputViewerTab,
  raw: unknown,
  logs: readonly OutputLogLine[],
): string | undefined {
  if (tab === 'raw') {
    return `json · ${formatBytes(new TextEncoder().encode(JSON.stringify(raw) ?? '').length)}`
  }
  if (tab === 'logs') return `${logs.length} ${logs.length === 1 ? 'line' : 'lines'}`
  return undefined
}
