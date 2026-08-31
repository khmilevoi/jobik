import { cx } from '../cx.js'
import { canvasMetrics } from './canvasTokens.js'
import s from './cardChrome.module.css'
import type { NodeCardData, NodeKindDot, NodeRunState } from './types.js'

/**
 * The class names a card's state, selection and start-ness decide. Each one is applied to a
 * different element; `cardChrome.module.css` is where the values live.
 */
export interface CardChrome {
  /** The card root. Sets the surface, border and halo, and the custom properties the header,
   *  title, status text and status dot read. */
  readonly card: string
  /** The header. Empty unless the state wears a wash — the accent one, or the failed one. */
  readonly header: string
  /** The leading 6px dot. */
  readonly kindDot: string
  /** The `Inputs` / `Outputs` labels. */
  readonly sectionLabel: string
}

export interface CardChromeOptions {
  readonly state: NodeRunState
  readonly selected?: boolean
  readonly isStart?: boolean
  readonly kindDot?: NodeKindDot
}

/** Spelled out in full, never indexed by a computed key — see `cssModuleUsage.test.ts`. */
const byState = {
  idle: s.idle,
  queued: s.queued,
  running: s.running,
  ok: s.ok,
  failed: s.failed,
  cached: s.cached,
} satisfies Record<NodeRunState, string>

const byKindDot = {
  start: s.kindDotStart,
  neutral: s.kindDotNeutral,
  queued: s.kindDotQueued,
  cached: s.kindDotCached,
  status: s.kindDotStatus,
} satisfies Record<NodeKindDot, string>

type SectionLabelStep = 'default' | 'faintest' | 'selectedStart'

const bySectionLabel = {
  default: s.sectionLabel,
  faintest: s.sectionLabelFaintest,
  selectedStart: s.sectionLabelSelectedStart,
} satisfies Record<SectionLabelStep, string>

function defaultKindDot(state: NodeRunState, isStart: boolean): NodeKindDot {
  if (isStart) return 'start'
  if (state === 'queued') return 'queued'
  if (state === 'cached') return 'cached'
  if (state === 'ok' || state === 'failed' || state === 'running') return 'status'
  return 'neutral'
}

/**
 * The whole `Node states` table in one place. `failed` outranks selection: a failed card keeps its
 * own border, halo, divider, wash and title even when selected, which is why `highlighted` is
 * withheld from it rather than overridden. `running` always wears the selection treatment, whether
 * or not it is selected — per `### Node states`.
 */
export function resolveCardChrome(options: CardChromeOptions): CardChrome {
  const { state } = options
  const isStart = options.isStart ?? false
  const failed = state === 'failed'
  const highlighted = !failed && (options.selected === true || state === 'running')
  const dot = options.kindDot ?? defaultKindDot(state, isStart)

  const sectionLabel = (): string => {
    if (state === 'queued') return bySectionLabel.faintest
    if (isStart && options.selected === true) return bySectionLabel.selectedStart
    return bySectionLabel.default
  }

  return {
    card: cx(byState[state], highlighted && s.highlighted),
    header: failed || highlighted ? s.headerWash : '',
    kindDot: byKindDot[dot],
    sectionLabel: sectionLabel(),
  }
}

/** `### Layout and metrics`: 230 start, 316 with an inline output slot, 236 plain. */
export function resolveCardWidth(data: NodeCardData): number {
  if (data.width !== undefined) return data.width
  if (data.outputSlot !== undefined) return canvasMetrics.nodeWidth.withSlot
  if (data.isStart === true) return canvasMetrics.nodeWidth.start
  return canvasMetrics.nodeWidth.plain
}
