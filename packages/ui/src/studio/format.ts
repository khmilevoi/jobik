/**
 * The two time formats the artboards fix.
 *
 * `ok · 2.1s` and `Last run · 2.4s` are one decimal with a trailing `s`; the live log's mono stamp
 * (`0.31`) is two decimals with no unit. P11's `format.ts` formats already-formatted strings; these
 * are the two that turn a millisecond count into one.
 */

export function formatElapsed(elapsedMs: number): string {
  const clamped = elapsedMs > 0 ? elapsedMs : 0
  return `${(clamped / 1000).toFixed(1)}s`
}

export function formatLogTime(offsetMs: number): string {
  const clamped = offsetMs > 0 ? offsetMs : 0
  return (clamped / 1000).toFixed(2)
}

/**
 * The output dock's two mono strings, from artboard `2A`.
 *
 * Open header: `render.image · Buffer[3] · run #221`. Collapsed strip: `render.image · 3 files ·
 * run #221`. Every part is real — the node id, its first asset-bearing output field, that field's
 * own annotation, how many asset fields the node actually produced, and the run number — so a node
 * that produced no asset gets the short form rather than an invented one.
 */
export function formatOutputContext(args: {
  nodeId: string
  field?: string
  annotation?: string
  fileCount: number
  runNumber?: number
}): string {
  return outputContextParts(args, `${args.annotation ?? ''}[${args.fileCount}]`).join(' · ')
}

export function formatOutputSummary(args: {
  nodeId: string
  field?: string
  fileCount: number
  runNumber?: number
}): string {
  const files = `${args.fileCount} ${args.fileCount === 1 ? 'file' : 'files'}`
  return outputContextParts(args, files).join(' · ')
}

function outputContextParts(
  args: { nodeId: string; field?: string; fileCount: number; runNumber?: number },
  middle: string,
): readonly string[] {
  const parts = [args.field === undefined ? args.nodeId : `${args.nodeId}.${args.field}`]
  if (args.fileCount > 0) parts.push(middle)
  if (args.runNumber !== undefined) parts.push(`run #${args.runNumber}`)
  return parts
}
