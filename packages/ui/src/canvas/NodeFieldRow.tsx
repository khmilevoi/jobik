import { TypeAnnotation } from '../primitives/index.js'
import { layout, px } from '../tokens.js'
import { canvasMetrics } from './canvasTokens.js'
import { FieldHandle } from './FieldHandle.js'
import {
  fieldAnnotationColor,
  fieldLabelColor,
  resolveFieldTone,
  resolveHandleTone,
} from './fields.js'
import type { HandleDirection, NodeFieldSpec } from './types.js'

export interface NodeFieldRowProps {
  readonly field: NodeFieldSpec
  readonly direction: HandleDirection
  /** The owning card is a start node — every one of its rows is on the active label step. */
  readonly isStart: boolean
  /** This field is an endpoint of an accent or active edge. */
  readonly live: boolean
}

/**
 * `### Node cards`: one 30px row per field, name left and type annotation right in mono, with the
 * field's handle centred on the row and hanging 4px off the card edge.
 */
export function NodeFieldRow(props: NodeFieldRowProps) {
  const { field, direction, isStart, live } = props
  const tone = resolveFieldTone(field, isStart)

  return (
    <div
      data-testid={`field-row-${direction}-${field.name}`}
      style={{
        height: px(layout.fieldRowHeight),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `0 ${px(canvasMetrics.cardPaddingX)}`,
        position: 'relative',
      }}
    >
      <div data-testid="field-name" style={{ fontSize: px(11.5), color: fieldLabelColor(tone) }}>
        {field.name}
      </div>
      <TypeAnnotation data-testid="field-annotation">
        {tone === 'dim' ? (
          <span data-testid="field-annotation-dim" style={{ color: fieldAnnotationColor(tone) }}>
            {field.annotation}
          </span>
        ) : (
          field.annotation
        )}
      </TypeAnnotation>
      <FieldHandle
        direction={direction}
        name={field.name}
        tone={resolveHandleTone(field, isStart, live)}
        connectable={field.connectable}
      />
    </div>
  )
}
