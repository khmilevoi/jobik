import { accent, borders, kindDotColors, statusColors, surfaces, textColors } from '../tokens.js'
import { canvasColors, canvasMetrics } from './canvasTokens.js'
import type { NodeCardData, NodeKindDot, NodeRunState } from './types.js'

export interface CardChrome {
  readonly background: string
  readonly border: string
  readonly boxShadow: string | undefined
  readonly headerDivider: string
  readonly headerWash: string | undefined
  readonly title: string
  readonly status: string
  readonly sectionLabel: string
  readonly kindDot: string
}

export interface CardChromeOptions {
  readonly state: NodeRunState
  readonly selected?: boolean
  readonly isStart?: boolean
  readonly kindDot?: NodeKindDot
}

const backgrounds: Record<NodeRunState, string> = {
  idle: surfaces.nodeCard,
  queued: surfaces.queuedNode,
  running: surfaces.nodeCard,
  ok: surfaces.nodeCard,
  failed: surfaces.failedNodeCard,
  cached: surfaces.cachedNode,
}

const statuses: Record<NodeRunState, string> = {
  idle: textColors.activeMeta,
  queued: textColors.sectionLabel,
  running: accent.cssVar,
  ok: statusColors.ok,
  failed: statusColors.failed,
  cached: textColors.muted,
}

function defaultKindDot(state: NodeRunState, isStart: boolean): NodeKindDot {
  if (isStart) return 'start'
  if (state === 'queued') return 'queued'
  if (state === 'cached') return 'cached'
  if (state === 'ok' || state === 'failed' || state === 'running') return 'status'
  return 'neutral'
}

/**
 * The whole `Node states` table in one place. `failed` outranks selection: a failed card keeps its
 * own border, halo, divider, wash and title even when selected. `running` always wears the
 * selection treatment always — per `### Node states`.
 */
export function resolveCardChrome(options: CardChromeOptions): CardChrome {
  const { state } = options
  const isStart = options.isStart ?? false
  const failed = state === 'failed'
  const highlighted = !failed && (options.selected === true || state === 'running')
  const status = statuses[state]
  const dot = options.kindDot ?? defaultKindDot(state, isStart)

  const title = (): string => {
    if (failed) return canvasColors.titleFailed
    if (highlighted) return canvasColors.titleSelected
    if (state === 'cached') return canvasColors.titleCached
    if (state === 'queued') return textColors.inactiveListItem
    return textColors.nodeTitle
  }

  const border = (): string => {
    if (failed) return `1px solid ${canvasColors.failedBorder}`
    if (highlighted) return `1px solid ${accent.selectionBorder}`
    if (state === 'queued') return `1px dashed ${borders.dashed}`
    if (state === 'cached') return `1px solid ${borders.inset}`
    return `1px solid ${borders.control}`
  }

  const headerDivider = (): string => {
    if (failed) return canvasColors.failedHeaderDivider
    if (state === 'queued') return borders.inlineHairline
    if (state === 'cached') return canvasColors.cachedHeaderDivider
    return borders.nodeHeaderDivider
  }

  const boxShadow = (): string | undefined => {
    if (failed) return canvasColors.failedHalo
    if (highlighted) return accent.selectionHalo
    return undefined
  }

  const headerWash = (): string | undefined => {
    if (failed) return canvasColors.failedHeaderWash
    if (highlighted) return accent.headerWash
    return undefined
  }

  const sectionLabel = (): string => {
    if (state === 'queued') return textColors.faintest
    if (isStart && options.selected === true) return canvasColors.sectionLabelSelectedStart
    return textColors.sectionLabel
  }

  return {
    background: backgrounds[state],
    border: border(),
    boxShadow: boxShadow(),
    headerDivider: headerDivider(),
    headerWash: headerWash(),
    title: title(),
    status,
    sectionLabel: sectionLabel(),
    kindDot: dot === 'status' ? status : kindDotColors[dot],
  }
}

/** `### Layout and metrics`: 230 start, 316 with an inline output slot, 236 plain. */
export function resolveCardWidth(data: NodeCardData): number {
  if (data.width !== undefined) return data.width
  if (data.outputSlot !== undefined) return canvasMetrics.nodeWidth.withSlot
  if (data.isStart === true) return canvasMetrics.nodeWidth.start
  return canvasMetrics.nodeWidth.plain
}
