import type { FlowUiDescriptor, FlowUiOutputComponent, OutputComponentProps } from './flowUi.js'
import { RawJson } from './RawJson.js'

/**
 * `## Flow-local output UI`: "An absent renderer falls back to a generic JSON viewer." That viewer
 * is the design's own `Raw` treatment applied to one node's output — a binary field serialises
 * exactly as the artboard's Raw panel shows it, `{ "type": "Buffer", "bytes": …, "mime": … }`.
 */
export function GenericOutput(props: OutputComponentProps) {
  const card = props.surface === 'card'
  return (
    <div
      data-testid="generic-output"
      style={card ? { width: '100%', height: '100%', overflow: 'auto' } : undefined}
    >
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
