import { FieldHandle } from '#canvas/FieldHandle/FieldHandle.js'
import {
  fieldAnnotationClass,
  fieldLabelClass,
  resolveFieldTone,
  resolveHandleTone,
} from '#canvas/fields.js'
import type { HandleDirection, NodeFieldSpec } from '#canvas/types.js'
import { cx } from '#cx.js'
import { TypeAnnotation } from '#primitives/index.js'
import s from './NodeFieldRow.module.css'

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
  const problem = field.problem

  // `3D`: a marked port draws its annotation in the failure hue whatever its tone was, so the
  // wrapping span is what both the dim tone and a validation mark need — never both at once.
  const annotation =
    problem === undefined && tone !== 'dim' ? (
      field.annotation
    ) : (
      <span
        data-testid={problem === undefined ? 'field-annotation-dim' : 'field-annotation-problem'}
        className={fieldAnnotationClass(tone, problem)}
      >
        {field.annotation}
      </span>
    )

  return (
    <div data-testid={`field-row-${direction}-${field.name}`} className={s.row}>
      <div data-testid="field-name" className={cx(s.fieldName, fieldLabelClass(tone, problem))}>
        {field.name}
      </div>
      <TypeAnnotation data-testid="field-annotation">{annotation}</TypeAnnotation>
      <FieldHandle
        direction={direction}
        name={field.name}
        tone={resolveHandleTone(field, isStart, live)}
        connectable={field.connectable}
        {...(problem === undefined ? {} : { problem })}
      />
    </div>
  )
}
