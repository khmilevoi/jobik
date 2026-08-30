import type { Node, NodeProps } from '@xyflow/react'
import { SectionLabel } from '../primitives/index.js'
import { accent, layout, px, radii, textColors } from '../tokens.js'
import { canvasColors, canvasMetrics } from './canvasTokens.js'
import { resolveCardChrome, resolveCardWidth } from './cardChrome.js'
import { fieldHandleId } from './fields.js'
import { NodeCardHeader } from './NodeCardHeader.js'
import { NodeFieldRow } from './NodeFieldRow.js'
import { NodeOutputSlot } from './NodeOutputSlot.js'
import { NodeStateBody } from './NodeStateBody.js'
import type { HandleDirection, NodeCardData, NodeFieldSpec } from './types.js'

export interface NodeCardProps {
  readonly data: NodeCardData
}

const sectionRowStyle = {
  height: px(layout.sectionLabelRowHeight),
  display: 'flex',
  alignItems: 'center',
  padding: `0 ${px(canvasMetrics.cardPaddingX)}`,
} as const

/** `0.62` -> `'62%'`, without the floating-point tail `0.62 * 100` leaves behind. */
function progressWidth(progress: number): string {
  const clamped = Math.min(Math.max(progress, 0), 1)
  return `${Math.round(clamped * 10000) / 100}%`
}

function Section(props: {
  readonly direction: HandleDirection
  readonly label: 'Inputs' | 'Outputs'
  readonly fields: readonly NodeFieldSpec[]
  readonly color: string
  readonly isStart: boolean
  readonly live: ReadonlySet<string>
}) {
  return (
    <>
      <SectionLabel
        data-testid={`node-section-${props.label.toLowerCase()}`}
        color={props.color}
        style={sectionRowStyle}
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
  })
  const inputs = data.inputs ?? []
  const outputs = data.outputs ?? []
  const live = new Set(data.liveFields ?? [])
  const captionColor = data.state === 'ok' ? canvasColors.metadata : textColors.typeAnnotation

  return (
    <div
      data-testid={`node-card-${data.id}`}
      style={{
        width: px(resolveCardWidth(data)),
        background: chrome.background,
        border: chrome.border,
        borderRadius: px(radii.nodeCard),
        boxShadow: chrome.boxShadow,
      }}
    >
      <NodeCardHeader data={data} chrome={chrome} />

      {data.progress === undefined ? null : (
        <div
          data-testid="node-progress-track"
          style={{
            height: px(canvasMetrics.progressBarHeight),
            background: canvasColors.progressTrack,
          }}
        >
          <div
            data-testid="node-progress-bar"
            style={{
              width: progressWidth(data.progress),
              height: px(canvasMetrics.progressBarHeight),
              background: accent.cssVar,
            }}
          />
        </div>
      )}

      {inputs.length === 0 ? null : (
        <Section
          direction="target"
          label="Inputs"
          fields={inputs}
          color={chrome.sectionLabel}
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
          color={chrome.sectionLabel}
          isStart={isStart}
          live={live}
        />
      )}

      {data.detail === undefined ? null : (
        <NodeStateBody detail={data.detail} captionColor={captionColor} />
      )}

      {inputs.length === 0 && outputs.length === 0 ? null : (
        <div data-testid="node-card-footer" style={{ height: px(layout.cardFooterHeight) }} />
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
