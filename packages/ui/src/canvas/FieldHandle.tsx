import { Handle, Position } from '@xyflow/react'
import { fieldHandleId, fieldHandleStyle } from './fields.js'
import type { FieldHandleTone, HandleDirection } from './types.js'

export interface FieldHandleProps {
  readonly direction: HandleDirection
  readonly name: string
  readonly tone: FieldHandleTone
  /** Default `true`. */
  readonly connectable?: boolean
}

/** The 8px field handle. Sources sit on the right edge, targets on the left. */
export function FieldHandle(props: FieldHandleProps) {
  const { direction, name, tone } = props
  return (
    <Handle
      type={direction}
      position={direction === 'source' ? Position.Right : Position.Left}
      id={fieldHandleId(direction, name)}
      isConnectable={props.connectable ?? true}
      style={fieldHandleStyle(tone, direction)}
      data-testid={`field-handle-${direction}-${name}`}
    />
  )
}
