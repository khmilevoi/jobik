import { cx } from '../../cx.js'
import type { FlowUiDescriptor, FlowUiOutputComponent, OutputComponentProps } from '../flowUi.js'
import { RawJson } from '../RawJson/RawJson.js'
import s from './GenericOutput.module.css'

/**
 * `## Flow-local output UI`: "An absent renderer falls back to a generic JSON viewer." That viewer
 * is the design's own `Raw` treatment applied to one node's output — a binary field serialises
 * exactly as the artboard's Raw panel shows it, `{ "type": "Buffer", "bytes": …, "mime": … }`.
 */
export function GenericOutput(props: OutputComponentProps) {
  const card = props.surface === 'card'
  return (
    <div data-testid="generic-output" className={cx(card && s.card)}>
      <RawJson value={props.output} />
    </div>
  )
}

/** The component that fills the `Preview` tab and the inline slot for one node. */
export function resolveOutputComponent(
  descriptor: FlowUiDescriptor | undefined,
  nodeId: string,
): FlowUiOutputComponent {
  return descriptor?.nodes[nodeId]?.Output ?? GenericOutput
}
