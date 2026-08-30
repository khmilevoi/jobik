import type { AssetDescriptor } from '@jobik/core'
import type { ComponentType } from 'react'

/**
 * `## Flow-local output UI`: a flow ships a `flow.ui.tsx` whose default export maps a flow-level
 * node id to a React component that renders the successful output only. Jobik keeps the node
 * header, inputs, handles, status and error display, and the whole output viewer chrome.
 */

/** Where a flow-local component is being rendered. */
export type OutputSurface =
  /** The node card's inline slot — roughly 140px tall. */
  | 'card'
  /** The `Preview` tab of the output viewer — full panel width. */
  | 'viewer'

/** One node's settled output as the browser sees it: binary fields are `AssetDescriptor`s. */
export type OutputValues = Readonly<Record<string, unknown>>

/**
 * Everything a flow-local output component is given.
 *
 * Deliberately not generic: React props are contravariant, so a component declared against a
 * narrower `output` could not be registered in `FlowUiDescriptor['nodes']`. Narrow inside the
 * component instead — `isAssetDescriptor` is exported for exactly that.
 */
export interface OutputComponentProps {
  readonly nodeId: string
  readonly output: OutputValues
  readonly surface: OutputSurface
  /**
   * The URL the server serves this asset's bytes under. P14 supplies the real implementation;
   * `undefined` means the URL is not known yet and the component should show its placeholder.
   */
  readonly assetUrl: (descriptor: AssetDescriptor) => string | undefined
}

export type FlowUiOutputComponent = ComponentType<OutputComponentProps>

export interface FlowUiNodeEntry {
  readonly Output: FlowUiOutputComponent
}

/** The extension descriptor a `flow.ui.tsx` default-exports. */
export interface FlowUiDescriptor {
  /** Keyed by flow-level node id, e.g. `render`. */
  readonly nodes: Readonly<Record<string, FlowUiNodeEntry>>
}

/**
 * Type the default export of a `flow.ui.tsx`:
 *
 * ```tsx
 * export default defineFlowUi({ nodes: { render: { Output: RenderedImage } } })
 * ```
 *
 * Identity at runtime — the descriptor is data, and the UI loader (P14) is what acts on it.
 */
export function defineFlowUi(descriptor: FlowUiDescriptor): FlowUiDescriptor {
  return descriptor
}

/** Whether an arbitrary module's default export is safe for the loader to mount. */
export function isFlowUiDescriptor(value: unknown): value is FlowUiDescriptor {
  if (value === null || typeof value !== 'object') return false
  const nodes = (value as { nodes?: unknown }).nodes
  if (nodes === null || typeof nodes !== 'object') return false
  return Object.values(nodes).every(
    (entry) =>
      entry !== null &&
      typeof entry === 'object' &&
      typeof (entry as { Output?: unknown }).Output === 'function',
  )
}

/** Whether an output field holds the wire shape of a binary field rather than a JSON value. */
export function isAssetDescriptor(value: unknown): value is AssetDescriptor {
  if (value === null || typeof value !== 'object') return false
  const candidate = value as Partial<AssetDescriptor>
  return (
    candidate.type === 'Buffer' &&
    typeof candidate.mime === 'string' &&
    typeof candidate.bytes === 'number' &&
    typeof candidate.id === 'string'
  )
}
