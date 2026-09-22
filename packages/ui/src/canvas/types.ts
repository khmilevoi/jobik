import type { CSSProperties, ReactNode } from 'react'
import type { KindDotTone } from '#tokens.js'

/**
 * The seven card treatments the artboards fix. `idle` is the default, un-run card.
 *
 * `retrying` is `3B`'s own row and belongs here rather than on an axis of its own: it is a card
 * *state* — the failed surface and title under a quiet border, an accent header wash, a spinner in
 * place of the dot — and it displaces the failed treatment rather than layering over it. It never
 * comes off a run stream: no node status says `retrying`, so only a caller that knows a retry was
 * asked for can set it.
 */
export type NodeRunState = 'idle' | 'queued' | 'running' | 'ok' | 'failed' | 'cached' | 'retrying'

/** P4's four kind dots, plus `status` — the dot painted in the card's own
 *  status colour. */
export type NodeKindDot = KindDotTone | 'status'

export type FieldTone = 'active' | 'normal' | 'dim'
export type FieldHandleTone = 'accent' | 'idle' | 'dim'
export type HandleDirection = 'source' | 'target'

/**
 * `3D` — what the last validation said about a node. Deliberately its own axis rather than a
 * seventh `NodeRunState`: a flow is checked before it is run, so a card is normally `idle` while
 * it carries one, and the two never describe the same thing.
 *
 * `error` is the node the finding names, whose port does have a source — the solid failure border
 * and the 3 px ring, the same chrome a failed run draws. `blocked` is the node that cannot run
 * because a required input has no source at all: the queued surface under a **dashed** failure
 * border, with no header divider. The artboard draws both on its invalid board, on different
 * cards.
 */
export type NodeProblem = 'error' | 'blocked'

/**
 * `3D` — the three port marks the invalid board draws. All three recolour the type annotation;
 * what separates them is the label and the handle.
 *
 * - `mismatch` — the receiving port the finding is about (`render.markdown`). Its label brightens
 *   to `#e2d3d0` and its handle goes solid failure. It is the only field label the artboard lifts.
 * - `linked` — the sending port at the other end of that connection (`start1.markdown`). Solid
 *   failure handle and the same annotation hue, but the label is untouched: the type it declares
 *   is fine, it is the pairing that is not.
 * - `unsourced` — a required port with no source at all (`publish.caption`). Its handle is
 *   **dashed**, and the label stays ordinary.
 */
export type FieldProblem = 'mismatch' | 'linked' | 'unsourced'

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
  /** `3D` — the last validation marked this port. Independent of `tone` and `handleTone`. */
  readonly problem?: FieldProblem
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
  /**
   * `2A`: the accent `inspect` action that opens the output dock, in the caption row's trailing
   * cell. When supplied it takes that cell — `Studio — default` prints the producing node's name
   * there instead, and the two artboards never show both.
   */
  readonly onInspect?: () => void
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
      readonly readOnly?: boolean
      /** The tagged error name, mono 10.5px. */
      readonly errorName: string
      /** The safe message. */
      readonly message: ReactNode
      readonly onViewTrace?: () => void
      readonly onRetry?: () => void
      /**
       * `3B` column 2 — the retry is under way. Both footer buttons drop to `opacity:.45` and stop
       * responding: "Retry node dims the moment it is pressed. The node header swaps its dot for
       * the spinner and the 2 px header bar takes over as the progress read-out."
       *
       * This is the body's half of that state; the header's half is the card's own
       * `state: 'retrying'`. A caller sets both together — the error well stays on screen so the
       * card still says what it is retrying *from*.
       */
      readonly retrying?: boolean
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
  /**
   * `3D` — the last validation's verdict on this node. It outranks selection, exactly as `failed`
   * does: a marked card keeps its own border, halo and title while it is selected.
   */
  readonly problem?: NodeProblem
  /**
   * `3D` — the mono count in the header's trailing cell on a marked card, e.g. `1 error`. Only the
   * `error` card carries one; the artboard's `blocked` card has an empty trailing cell.
   */
  readonly problemCount?: string
}

export type EdgeShape = 'curved' | 'stepped'
/** `error` is `3D`'s failing connection: the failure hue at the heavier 1.4 px weight. */
export type FieldEdgeTone = 'accent' | 'idle' | 'active' | 'waiting' | 'error'

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
   * Structure: which nodes exist, where the document puts them, and what their fields declare. What
   * a run has to say about a node is NOT in here — a card asks `CanvasModel.nodeOverlay(id)` for
   * its own — so this array can stay still while a run streams.
   *
   * A new identity re-syncs the canvas's internal React Flow state, so it is still worth memoising
   * rather than constructing inline in render. It no longer costs an in-flight drag: a position is
   * taken from here only when this array actually MOVES the node, so a rebuilt-but-equal array
   * leaves the node under the pointer alone. Selection is always taken from the props.
   */
  readonly nodes: readonly FlowCanvasNode[]
  /**
   * Worth memoising for the same reason as `nodes` — a new identity re-syncs the same internal
   * state, since the edges are what decide which handles read as live.
   */
  readonly edges: readonly FlowCanvasEdge[]
  /** The selected entry point. Edges leaving it default to the accent tone. */
  readonly startNodeId?: string
  readonly selectedNodeId?: string
  /**
   * Which flow this graph belongs to — the only thing that makes the canvas play `4A`'s screen
   * change: *"The only 240 ms in the app. The outgoing graph fades and drifts 8 px up, the incoming
   * one arrives from 8 px down, and the chrome — top bar, panels, dock — never moves."*
   *
   * It is a separate prop and not derived from `nodes`, because those arrays also change identity
   * when a node is dragged or a validation lands, and neither of those is a screen change. Leave it
   * out and the canvas simply never animates — every other prop behaves exactly as before.
   */
  readonly flowId?: string
  /** The design's canvas props. Default `'curved'` and `true`. */
  readonly edgeShape?: EdgeShape
  readonly showDotGrid?: boolean
  /** Fired once, when a layout drag ends. Persisting the position is P14's. */
  readonly onNodeLayoutChange?: (change: NodeLayoutChange) => void
  /** Fired when a field-to-field connection completes. Persisting it is P14's. */
  readonly onConnectFields?: (connection: FieldConnection) => void
  /**
   * Fired with a node's id when a card whose `data.isStart` is `true` is clicked — the canvas's own
   * way to move the run panel's entry point, alongside the sidebar's `Start` section. A click on any
   * other card does nothing: there is no other node-selection affordance on the canvas today.
   */
  readonly onSelectStart?: (nodeId: string) => void
  /** Layout only — the canvas already fills its flex slot. Never a colour. */
  readonly style?: CSSProperties
}
