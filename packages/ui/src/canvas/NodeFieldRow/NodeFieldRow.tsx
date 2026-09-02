import { reatomComponent } from '@reatom/react'
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
 *
 * All four props stay. Not one of them has a home in `model/types.ts`: `field` is the descriptor's
 * declaration with the run's annotation and `3D`'s mark already folded in by the card, `isStart` is
 * the owning card's, and `live` is derived by `FlowCanvas` from the edge list — a fact about a pair
 * of nodes, which no per-field unit could answer without asking the whole canvas.
 */
export const NodeFieldRow = reatomComponent(function NodeFieldRow(props: NodeFieldRowProps) {
  const { field, direction, isStart, live } = props
  const tone = resolveFieldTone(field, isStart)
  const problem = field.problem

  // `3D`: a marked port draws its annotation in the failure hue whatever its tone was, so the
  // wrapping span is what both the dim tone and a validation mark need — never both at once.
  //
  // **The span is inside `field-annotation`, and that nesting is load-bearing.** `TypeAnnotation`
  // takes a `className`, so the hue looks like it could ride on the annotation element itself —
  // but that class and `.typeAnnotation` sit in two different stylesheets, and which of the two
  // wins would then depend on the order the bundler happens to emit them in. A child element
  // beats its parent whatever that order is. Anything reading the rendered colour — a test, an
  // audit — must therefore read the INNER span; `field-annotation` carries the size, not the tone.
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
}, 'NodeFieldRow')
