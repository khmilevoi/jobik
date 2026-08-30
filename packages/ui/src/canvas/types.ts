import type { CSSProperties, ReactNode } from 'react'
import type { KindDotTone } from '../tokens.js'

/** The six card treatments the artboards fix. `idle` is the default, un-run
 *  card. */
export type NodeRunState = 'idle' | 'queued' | 'running' | 'ok' | 'failed' | 'cached'

/** P4's four kind dots, plus `status` — the dot painted in the card's own
 *  status colour. */
export type NodeKindDot = KindDotTone | 'status'

export type FieldTone = 'active' | 'normal' | 'dim'
export type FieldHandleTone = 'accent' | 'idle' | 'dim'
export type HandleDirection = 'source' | 'target'

/** The three run-time annotations `### Node cards` names. */
export const RUN_ANNOTATIONS = {
  received: 'received',
  pending: 'pending',
  waiting: 'waiting',
} as const

export type NodeFieldSpec = {
  readonly name: string
  /** `string`, `Buffer`, or one of `RUN_ANNOTATIONS`. Rendered mono,
   *  right-aligned. */
  readonly annotation: string
  /** Overrides the tone derived from `annotation` and the card's start
   *  flag. */
  readonly tone?: FieldTone
  /** Overrides the tone derived from the field's tone and the edges
   *  attached to it. */
  readonly handleTone?: FieldHandleTone
  /** Default `true`. A `false` field still renders its handle; it just refuses
   *  connections. */
  readonly connectable?: boolean
}

export type NodeOutputSlotSpec = {
  /** P12 fills this. When omitted the slot renders the striped `image output`
   *  placeholder. */
  readonly content?: ReactNode
  /** Replaces the media area with the 1.5s shimmer. */
  readonly skeleton?: boolean
  /** The pulsing mono line centred on the shimmer, e.g. `rasterising
   *  1024×1024`. */
  readonly skeletonLabel?: ReactNode
  /** Left of the 18px caption row, e.g. `frame 2 of 3`, or the ok metadata
   *  row. */
  readonly caption?: ReactNode
  /** Right of the caption row, e.g. `imageOut`. */
  readonly source?: ReactNode
}

/**
 * The `Node states` body block. A card renders at most one, below its field
 * sections. `media` covers running (`skeleton`), ok (rendered output plus a
 * metadata caption) and cached (`dimmed`).
 */
export type NodeCardDetail =
  | {
      readonly kind: 'queued'
      /** e.g. `render.image`. Rendered mono inside the `Waiting on …`
       *  line. */
      readonly waitingOn: string
      /** Flex weights for the placeholder bars. Defaults to the artboard's
       *  `[1, 1, 2]`. */
      readonly placeholderBars?: readonly number[]
    }
  | {
      readonly kind: 'media'
      readonly content?: ReactNode
      readonly skeleton?: boolean
      /** The pulsing mono line centred on the shimmer, e.g.
       *  `rasterising`. */
      readonly skeletonLabel?: ReactNode
      /** The cached treatment: the media at `.55` opacity. */
      readonly dimmed?: boolean
      /** The mono line under the media, e.g. `frame 2 of 3 · 62%` or
       *  `1024×1024 · png · 412 kb`. */
      readonly caption?: ReactNode
    }
  | {
      readonly kind: 'failed'
      /** The tagged error name, mono 10.5px. */
      readonly errorName: string
      /** The safe message. */
      readonly message: ReactNode
      readonly onViewTrace?: () => void
      readonly onRetry?: () => void
    }

export type NodeCardData = {
  readonly id: string
  readonly state: NodeRunState
  /** Renders the uppercase accent `START` tag instead of the status, and
   *  activates field labels. */
  readonly isStart?: boolean
  /** The accent border, halo and header wash. `running` and `failed` set
   *  their own. */
  readonly selected?: boolean
  /** The leading 6px dot. Defaults from `state` and `isStart`. */
  readonly kindDot?: NodeKindDot
  /** Adds the 5px round status-coloured dot before the status text. */
  readonly statusDot?: boolean
  /** e.g. `ok`, `running`, `queued`, `done`, `failed`, `cached`, `idle`. */
  readonly status?: string
  /** e.g. `2.1s`. Rendered as `status · elapsed` when both are present. */
  readonly elapsed?: string
  /** `0`–`1`. Renders the 2px determinate bar directly under the header. */
  readonly progress?: number
  readonly inputs?: readonly NodeFieldSpec[]
  readonly outputs?: readonly NodeFieldSpec[]
  /**
   * The handle ids on this node that sit on an accent or active edge, as
   * `fieldHandleId(direction, name)` strings. `FlowCanvas` fills this from
   * the edge list; a card rendered on its own may fill it directly.
   */
  readonly liveFields?: readonly string[]
  readonly outputSlot?: NodeOutputSlotSpec
  readonly detail?: NodeCardDetail
  /** Overrides the width derived from `isStart` and `outputSlot`. */
  readonly width?: number
}

export type EdgeShape = 'curved' | 'stepped'
export type FieldEdgeTone = 'accent' | 'idle' | 'active' | 'waiting'

export type FieldEdgeData = {
  readonly tone: FieldEdgeTone
  readonly shape: EdgeShape
  /** Shifts a `stepped` elbow off the horizontal midpoint so parallel runs do
   *  not overlap. */
  readonly elbowOffset?: number
}

export interface FlowCanvasNode {
  readonly id: string
  readonly position: { readonly x: number; readonly y: number }
  readonly data: NodeCardData
}

export interface FlowCanvasEdge {
  readonly id: string
  readonly source: string
  readonly sourceField: string
  readonly target: string
  readonly targetField: string
  /** Defaults to `accent` when `source` is the canvas's start node, `idle`
   *  otherwise. */
  readonly tone?: FieldEdgeTone
  readonly elbowOffset?: number
}

export interface NodeLayoutChange {
  readonly nodeId: string
  readonly position: { readonly x: number; readonly y: number }
}

export interface FieldConnection {
  readonly source: string
  readonly sourceField: string
  readonly target: string
  readonly targetField: string
}

export interface FlowCanvasProps {
  /**
   * Must be referentially stable across renders. The canvas rebuilds its internal node
   * state (positions and selection) whenever `nodes` or `edges` changes identity, which
   * discards any in-flight drag position and React Flow's own selection state. Memoise
   * this array rather than constructing it inline in render.
   */
  readonly nodes: readonly FlowCanvasNode[]
  /**
   * Must be referentially stable across renders — see `nodes`. A new identity here
   * triggers the same internal rebuild and the same loss of drag/selection state.
   */
  readonly edges: readonly FlowCanvasEdge[]
  /** The selected entry point. Edges leaving it default to the accent tone. */
  readonly startNodeId?: string
  readonly selectedNodeId?: string
  /** The design's canvas props. Default `'curved'` and `true`. */
  readonly edgeShape?: EdgeShape
  readonly showDotGrid?: boolean
  /** Fired once, when a layout drag ends. Persisting the position is P14's. */
  readonly onNodeLayoutChange?: (change: NodeLayoutChange) => void
  /** Fired when a field-to-field connection completes. Persisting it is P14's. */
  readonly onConnectFields?: (connection: FieldConnection) => void
  /** Layout only — the canvas already fills its flex slot. Never a colour. */
  readonly style?: CSSProperties
}
