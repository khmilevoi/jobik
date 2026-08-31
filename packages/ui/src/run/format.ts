/**
 * The run panel's copy, assembled from the artboards' own strings. Every template here appears
 * verbatim in `Jobik Studio.dc.html`; only the singular forms are this file's own, and they exist
 * because the artboards happen to show plural counts.
 */
import type { AssetDescriptor } from '@jobik/core'
import type { RunNodeTiming, RunStackFrame } from './types.js'

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`
}

/** `1 of 3 nodes complete` — `Studio — run in progress`, line 598. */
export function formatNodesComplete(completed: number, total: number): string {
  return `${completed} of ${total} ${plural(total, 'node')} complete`
}

/** `#219` while in flight, `#220 · 0.8s` once settled — `Run panel — states`, lines 777, 801, 838. */
export function formatRunMeta(runNumber: number, elapsed?: string): string {
  return elapsed === undefined ? `#${runNumber}` : `#${runNumber} · ${elapsed}`
}

/** `2.4s · 3 nodes` — `Studio — default`, line 307. */
export function formatLastRunMeta(totalElapsed: string, nodeCount: number): string {
  return `${totalElapsed} · ${nodeCount} ${plural(nodeCount, 'node')}`
}

/** `at imageOut.raster (imageOut.ts:184)` — `Run panel — states`, line 816. */
export function formatStackFrame(frame: RunStackFrame): string {
  return `at ${frame.fn} (${frame.file}:${frame.line})`
}

/** `↳ 6 frames hidden` — `Run panel — states`, line 818. `undefined` when nothing is hidden. */
export function formatHiddenFrames(hiddenFrames: number): string | undefined {
  if (hiddenFrames <= 0) return undefined
  return `↳ ${hiddenFrames} ${plural(hiddenFrames, 'frame')} hidden`
}

/**
 * The cells of a mono metadata row, for a renderer that draws its own `·` separators:
 * `['png', '412 kb']`. Both metadata rows the design fixes — the node card's inline slot caption
 * (`Studio — default`, 204–207) and the `Node states` ok body (714–716) — open with `1024×1024`,
 * a dimension no `AssetDescriptor` carries. These are the two cells one really does.
 */
export function assetMetaParts(asset: AssetDescriptor): readonly string[] {
  const subtype = asset.mime.split('/').at(-1) ?? asset.mime
  const size = asset.bytes < 1024 ? `${asset.bytes} b` : `${Math.round(asset.bytes / 1024)} kb`
  return [subtype, size]
}

/**
 * `png · 412 kb` from an `AssetDescriptor`. The artboard's own line is `png · 1024² · 412 kb`;
 * the dimensions are not in the descriptor, so a caller that has them passes `meta` instead.
 */
export function formatAssetMeta(asset: AssetDescriptor): string {
  return assetMetaParts(asset).join(' · ')
}

/**
 * The right-hand cell of a node row: the elapsed time, or the status word when there is none.
 *
 * `cached` shows both — `cached · 0.0s`, the `Node states` cached card's own label (design 750).
 * No run-panel artboard fixes a cached row, and `RunNodeTimings` draws no dot at all, so a bare
 * elapsed would leave a cached node indistinguishable from an `ok` one — the exact invisibility
 * standing ruling 3 recorded.
 */
export function runNodeStatusLabel(timing: RunNodeTiming): string {
  if (timing.status === 'cached') {
    return timing.elapsed === undefined ? timing.status : `${timing.status} · ${timing.elapsed}`
  }
  return timing.elapsed ?? timing.status
}
