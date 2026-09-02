import { reatomComponent } from '@reatom/react'
import type { Node, NodeProps } from '@xyflow/react'
import { type ReactNode, useRef } from 'react'
import { resolveCardChrome, resolveCardWidth } from '#canvas/cardChrome.js'
import { fieldHandleId } from '#canvas/fields.js'
import { NodeCardHeader } from '#canvas/NodeCardHeader/NodeCardHeader.js'
import { NodeFieldRow } from '#canvas/NodeFieldRow/NodeFieldRow.js'
import { NodeOutputSlot } from '#canvas/NodeOutputSlot/NodeOutputSlot.js'
import { NodeStateBody } from '#canvas/NodeStateBody/NodeStateBody.js'
import { applyNodeOverlay } from '#canvas/overlay.js'
import type {
  HandleDirection,
  NodeCardData,
  NodeFieldSpec,
  NodeOutputSlotSpec,
} from '#canvas/types.js'
import { cx, type StyleWithVars } from '#cx.js'
import { useStudioModel } from '#model/context.js'
import { SectionLabel } from '#primitives/index.js'
import { px, textColors } from '#tokens.js'
import s from './NodeCard.module.css'

export interface NodeCardProps {
  readonly data: NodeCardData
}

/**
 * What a running node puts in its reserved region — the shimmering well of
 * `Studio — run in progress` (design 1768), and nothing else. Module-level so the object identity
 * is stable across renders.
 */
const SKELETON_SLOT: NodeOutputSlotSpec = { skeleton: true }

/** `0.62` -> `'62%'`, without the floating-point tail `0.62 * 100` leaves behind. */
function progressWidth(progress: number): string {
  const clamped = Math.min(Math.max(progress, 0), 1)
  return `${Math.round(clamped * 10000) / 100}%`
}

function Section(props: {
  readonly direction: HandleDirection
  readonly label: 'Inputs' | 'Outputs'
  readonly fields: readonly NodeFieldSpec[]
  readonly sectionLabel: string
  readonly isStart: boolean
  readonly live: ReadonlySet<string>
}) {
  return (
    <>
      <SectionLabel
        data-testid={`node-section-${props.label.toLowerCase()}`}
        className={cx(s.sectionRow, props.sectionLabel)}
      >
        {props.label}
      </SectionLabel>
      {props.fields.map((field) => (
        <NodeFieldRow
          key={`${props.direction}:${field.name}`}
          field={field}
          direction={props.direction}
          isStart={props.isStart}
          live={props.live.has(fieldHandleId(props.direction, field.name))}
        />
      ))}
    </>
  )
}

/**
 * `### Node cards`: header, optional progress bar, `Inputs`, optional inline output slot,
 * `Outputs`, optional state body, 8px footer.
 *
 * **The card reads its own run state, and that is the refactor's headline fix.** `data` carries
 * structure — the node's id, its fields, whether it is a start, `3D`'s marks — and everything a run
 * has to say about this node arrives from `CanvasModel.nodeOverlay(data.id)`, a computed of its
 * own, created once per node id and invalidated by exactly the `node-status` lines that name that
 * node. The array `FlowCanvas` holds therefore stops carrying the run: it is invalidated zero times
 * across a whole run, an in-flight drag survives one, and a status line for `render` re-renders
 * `render`'s card and nothing else. `canvas/overlay.ts` states the merge, and it is
 * `studio/graphModel.ts`'s own precedence, so both spellings agree while both exist.
 *
 * Reading the model means this needs a `<StudioModelProvider>` above it — the same bargain
 * `RunPanel` takes, and the reason `RunPanelCard` refuses it. There is no undecorated fallback:
 * a card outside the Studio's tree is a component mounted outside the tree it was written for, and
 * `useStudioModel` says so loudly rather than drawing a plausible idle card. With a model but no
 * run, `nodeOverlay` answers `undefined` and `data` is drawn exactly as handed over — which is what
 * every artboard case in this component's test does.
 */
export const NodeCard = reatomComponent(function NodeCard(props: NodeCardProps) {
  // RTM-C01: one read, of one node's own computed. Reading the whole `overlays` map here — or
  // taking the run off `nodes` — is what put every card on every frame.
  const data = applyNodeOverlay(props.data, useStudioModel().canvas.nodeOverlay(props.data.id)())
  const isStart = data.isStart === true
  const chrome = resolveCardChrome({
    state: data.state,
    selected: data.selected,
    isStart,
    kindDot: data.kindDot,
    ...(data.problem === undefined ? {} : { problem: data.problem }),
  })
  const inputs = data.inputs ?? []
  const outputs = data.outputs ?? []
  const live = new Set(data.liveFields ?? [])
  const captionColor = data.state === 'ok' ? textColors.metadata : textColors.typeAnnotation
  // The two values a stylesheet cannot know: the card's own width, and how far the bar has run.
  const widthStyle: StyleWithVars = { '--jbk-card-width': px(resolveCardWidth(data)) }
  const progressStyle: StyleWithVars | undefined =
    data.progress === undefined
      ? undefined
      : { '--jbk-node-progress': progressWidth(data.progress) }

  /**
   * `4A` Node state, the box half: *"Colour is the only thing that moves — border, dot and glow
   * ease together while the node keeps its exact box, so a running graph never reflows."*
   *
   * A card on the canvas therefore reserves ONE region for everything a run has to show, always in
   * the same place — between the input and output sections, where `Studio — run in progress`
   * (design 1768) and `Studio — default` (design 1417) both put the well — and always at the same
   * height. `queued`, `running` and `ok` fill it with different content and measure the same, so a
   * result arriving moves nothing.
   *
   * The three fillings are all the design's own. `ok` is the settled slot the model builds.
   * `running` is the shimmering well the run-in-progress artboard draws in exactly that place, with
   * no label: the pulsing `rasterising 1024×1024` beside it is node-specific data nothing on the
   * wire carries, and inventing it is what `DECISIONS.md` D8 forbids. `queued` is the `Waiting on …`
   * block, which the `Node states` tile draws — here it sits in the reserved region rather than
   * below the outputs, because a state may change what fills the box and not where the box is.
   *
   * A `queued` card reserves the region even with nothing to put in it, and that empty case is the
   * one that matters most: a START node waits on no upstream, so it never carries a `Waiting on …`
   * block, and without this it was the one card in a graph that still grew 200 px when its result
   * landed.
   *
   * **The reservation is latched, and measurement is why.** A node's `ok` status and the report
   * carrying its output are two different lines on the stream, so for the frames in between the
   * card is settled with no slot to draw — and it collapsed to its idle height and grew back, a
   * visible twitch at the end of every node. The latch holds the region from the first in-run frame
   * until the card leaves the run, so those frames are simply the reserved box with nothing in it
   * yet. `idle` and `failed` release it: the first is a card no longer in a run, and the second is
   * terminal and has its own body to size to.
   *
   * A card that MOUNTS already settled — an artboard fixture, a canvas rebuilt from a finished run —
   * never latches, so it draws exactly what it is handed. Nothing reflowed, so nothing needs
   * reserving.
   *
   * A card with NO field sections is a `Node states` catalogue tile rather than a node on a graph:
   * it has no slot position to reserve, nothing around it to reflow, and the artboard draws its
   * five cards at five different heights on purpose. Those keep the old layout exactly.
   */
  const hasSections = inputs.length > 0 || outputs.length > 0
  const inFlight = data.state === 'queued' || data.state === 'running'
  const latched = useRef(false)
  if (data.state === 'idle' || data.state === 'failed') latched.current = false
  else if (inFlight) latched.current = true
  const reserves = hasSections && (inFlight || latched.current || data.outputSlot !== undefined)
  const runBody = ((): ReactNode => {
    if (!reserves) return null
    if (data.outputSlot !== undefined) {
      return <NodeOutputSlot slot={data.outputSlot} captionColor={captionColor} />
    }
    if (data.detail !== undefined && data.detail.kind !== 'failed') {
      return <NodeStateBody detail={data.detail} captionColor={captionColor} />
    }
    if (data.state === 'running') {
      return <NodeOutputSlot slot={SKELETON_SLOT} captionColor={captionColor} />
    }
    // A queued node with no upstream to name — a start — reserves the space and shows nothing in
    // it. The reservation is the point; the emptiness is honest.
    return null
  })()

  /**
   * The body that still sits BELOW the output section. The failed treatment stays there and stays
   * unreserved: it is a terminal state whose error well and two actions have to size to their own
   * content, and the `Node states` artboard draws that card taller than the rest on purpose. Every
   * other body has moved into the reserved region above, so it is not drawn twice.
   */
  const detailBelow =
    data.detail === undefined || (reserves && data.detail.kind !== 'failed')
      ? undefined
      : data.detail

  return (
    <div
      data-testid={`node-card-${data.id}`}
      className={cx(s.card, chrome.card)}
      style={widthStyle}
    >
      <NodeCardHeader data={data} chrome={chrome} />

      {/*
        The track is always here, in every state, and only its groove and its bar are conditional —
        `4A` requires the card to keep its exact box while its colours ease, and mounting the track
        with the run made the card 2px taller on exactly the frame the ease begins.
      */}
      <div
        data-testid="node-progress-track"
        className={cx(s.progressTrack, data.progress !== undefined && s.progressTrackFilled)}
      >
        {progressStyle === undefined ? null : (
          <div data-testid="node-progress-bar" className={s.progressBar} style={progressStyle} />
        )}
      </div>

      {inputs.length === 0 ? null : (
        <Section
          direction="target"
          label="Inputs"
          fields={inputs}
          sectionLabel={chrome.sectionLabel}
          isStart={isStart}
          live={live}
        />
      )}

      {reserves ? (
        <div data-testid="node-run-region" className={s.runRegion}>
          {runBody}
        </div>
      ) : data.outputSlot === undefined ? null : (
        <NodeOutputSlot slot={data.outputSlot} captionColor={captionColor} />
      )}

      {outputs.length === 0 ? null : (
        <Section
          direction="source"
          label="Outputs"
          fields={outputs}
          sectionLabel={chrome.sectionLabel}
          isStart={isStart}
          live={live}
        />
      )}

      {detailBelow === undefined ? null : (
        <NodeStateBody detail={detailBelow} captionColor={captionColor} />
      )}

      {inputs.length === 0 && outputs.length === 0 ? null : (
        <div data-testid="node-card-footer" className={s.footer} />
      )}
    </div>
  )
}, 'NodeCard')

export type JobikFlowNode = Node<NodeCardData, 'jobikNode'>

/**
 * The `nodeTypes` entry. `data.selected` wins; React Flow's own selection is the fallback.
 *
 * It reads nothing itself — the overlay subscription belongs one level down, in the card React Flow
 * re-renders on its own account — so this is the plain adapter it always was, wrapped only to keep
 * the directory uniform.
 */
export const JobikNode = reatomComponent(function JobikNode(props: NodeProps<JobikFlowNode>) {
  const data =
    props.data.selected === undefined ? { ...props.data, selected: props.selected } : props.data
  return <NodeCard data={data} />
}, 'JobikNode')
