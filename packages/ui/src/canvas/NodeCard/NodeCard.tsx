import type { Node, NodeProps } from '@xyflow/react'
import { resolveCardChrome, resolveCardWidth } from '#canvas/cardChrome.js'
import { fieldHandleId } from '#canvas/fields.js'
import { NodeCardHeader } from '#canvas/NodeCardHeader/NodeCardHeader.js'
import { NodeFieldRow } from '#canvas/NodeFieldRow/NodeFieldRow.js'
import { NodeOutputSlot } from '#canvas/NodeOutputSlot/NodeOutputSlot.js'
import { NodeStateBody } from '#canvas/NodeStateBody/NodeStateBody.js'
import type { HandleDirection, NodeCardData, NodeFieldSpec } from '#canvas/types.js'
import { cx, type StyleWithVars } from '#cx.js'
import { SectionLabel } from '#primitives/index.js'
import { px, textColors } from '#tokens.js'
import s from './NodeCard.module.css'

export interface NodeCardProps {
  readonly data: NodeCardData
}

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
 * `Outputs`, optional state body, 8px footer. Pure — every branch comes from `data`.
 */
export function NodeCard(props: NodeCardProps) {
  const { data } = props
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

  return (
    <div
      data-testid={`node-card-${data.id}`}
      className={cx(s.card, chrome.card)}
      style={widthStyle}
    >
      <NodeCardHeader data={data} chrome={chrome} />

      {data.progress === undefined ? null : (
        <div data-testid="node-progress-track" className={s.progressTrack}>
          <div data-testid="node-progress-bar" className={s.progressBar} style={progressStyle} />
        </div>
      )}

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

      {data.outputSlot === undefined ? null : (
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

      {data.detail === undefined ? null : (
        <NodeStateBody detail={data.detail} captionColor={captionColor} />
      )}

      {inputs.length === 0 && outputs.length === 0 ? null : (
        <div data-testid="node-card-footer" className={s.footer} />
      )}
    </div>
  )
}

export type JobikFlowNode = Node<NodeCardData, 'jobikNode'>

/** The `nodeTypes` entry. `data.selected` wins; React Flow's own selection is the fallback. */
export function JobikNode(props: NodeProps<JobikFlowNode>) {
  const data =
    props.data.selected === undefined ? { ...props.data, selected: props.selected } : props.data
  return <NodeCard data={data} />
}
