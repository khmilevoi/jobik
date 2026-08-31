import { cx } from '#cx.js'
import { canvasMetrics } from './canvasTokens.js'
import s from './cardChrome.module.css'
import type { NodeCardData, NodeKindDot, NodeProblem, NodeRunState } from './types.js'

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
  /** `3D` — the last validation's verdict. Outranks both the run state and selection. */
  readonly problem?: NodeProblem
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

const byProblem = {
  error: s.problemError,
  blocked: s.problemBlocked,
} satisfies Record<NodeProblem, string>

const byKindDot = {
  start: s.kindDotStart,
  neutral: s.kindDotNeutral,
  queued: s.kindDotQueued,
  cached: s.kindDotCached,
  status: s.kindDotStatus,
} satisfies Record<NodeKindDot, string>

type SectionLabelStep = 'default' | 'faintest' | 'selected'

const bySectionLabel = {
  default: s.sectionLabel,
  faintest: s.sectionLabelFaintest,
  selected: s.sectionLabelSelected,
} satisfies Record<SectionLabelStep, string>

function defaultKindDot(
  state: NodeRunState,
  isStart: boolean,
  problem: NodeProblem | undefined,
): NodeKindDot {
  // `3D` invalid board: the marked card's dot is the failure hue, the blocked card's is the queued
  // grey — in both cases the card's own status colour, which is what `status` means.
  if (problem === 'error') return 'status'
  if (problem === 'blocked') return 'queued'
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
  const { state, problem } = options
  const isStart = options.isStart ?? false
  const failed = state === 'failed'
  // `3D`: a validation mark outranks selection for the same reason `failed` does — the accent
  // border would paint over the very thing the mark exists to point at.
  const highlighted =
    !failed && problem === undefined && (options.selected === true || state === 'running')
  const dot = options.kindDot ?? defaultKindDot(state, isStart, problem)

  // `### Selection and hover`: the section label lifts from `#4e555b` to `#535a60` on a selected
  // card, exactly as the title lifts — so it follows `highlighted`, not `isStart`. Queued still
  // outranks it: that card's whole ramp is one step darker.
  const sectionLabel = (): string => {
    if (state === 'queued') return bySectionLabel.faintest
    return highlighted ? bySectionLabel.selected : bySectionLabel.default
  }

  return {
    // The problem class is written last so it wins the ties source order settles inside
    // `cardChrome.module.css`, exactly as `.highlighted` does over the six state rules.
    card: cx(
      byState[state],
      highlighted && s.highlighted,
      problem !== undefined && byProblem[problem],
    ),
    header: failed || highlighted || problem === 'error' ? s.headerWash : '',
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
