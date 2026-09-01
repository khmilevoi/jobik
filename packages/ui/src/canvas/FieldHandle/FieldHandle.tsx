import { reatomComponent } from '@reatom/react'
import { Handle, Position } from '@xyflow/react'
import { fieldHandleClass, fieldHandleId } from '#canvas/fields.js'
import type { FieldHandleTone, FieldProblem, HandleDirection } from '#canvas/types.js'

export interface FieldHandleProps {
  readonly direction: HandleDirection
  readonly name: string
  readonly tone: FieldHandleTone
  /** Default `true`. */
  readonly connectable?: boolean
  /** `3D` — the validation mark on this port: solid failure, or dashed where it has no source. */
  readonly problem?: FieldProblem
}

/**
 * The 8px field handle. Sources sit on the right edge, targets on the left.
 *
 * Every value it draws is the row's, and the row's is the card's. There is no atom for a handle to
 * read and inventing one would invent state, so this is wrapped and left alone.
 */
export const FieldHandle = reatomComponent(function FieldHandle(props: FieldHandleProps) {
  const { direction, name, tone } = props
  return (
    <Handle
      type={direction}
      position={direction === 'source' ? Position.Right : Position.Left}
      id={fieldHandleId(direction, name)}
      isConnectable={props.connectable ?? true}
      className={fieldHandleClass(tone, direction, props.problem)}
      data-testid={`field-handle-${direction}-${name}`}
    />
  )
}, 'FieldHandle')
