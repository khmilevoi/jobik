import type { FlowDocument } from '@jobik/core'
import type {
  FlowCanvasEdge,
  FlowCanvasNode,
  NodeCardData,
  NodeCardDetail,
  NodeFieldSpec,
  NodeOutputSlotSpec,
  NodeRunState,
} from '#canvas/index.js'
import { endpointKey } from '#canvas/index.js'
import type { FlowListItem, SafeFlowDescriptorPayload } from '#client/index.js'
import type { FlowNodeSummary, FlowSummary, InventoryEntry } from '#shell/index.js'
import type { FlowProblemModel } from './problems.js'

/**
 * The safe flow descriptor and the JSON document, mapped onto P7's canvas props.
 *
 * Nothing here knows about React or about a run in flight: a run arrives as an overlay map, so the
 * same function serves the idle canvas and the streaming one and `StudioApp` can memoise on exactly
 * the inputs that change.
 */

/** A node's run-time appearance. `runPresenter.ts` produces these; this module applies them. */
export type NodeOverlay = {
  readonly state: NodeRunState
  readonly status?: string
  readonly elapsed?: string
  readonly progress?: number
  /** Replaces every input field's type annotation while a run is in flight. */
  readonly inputAnnotation?: string
  /** Replaces every output field's type annotation while a run is in flight. */
  readonly outputAnnotation?: string
  readonly detail?: NodeCardDetail
  readonly outputSlot?: NodeOutputSlotSpec
  /**
   * Draw the status as `● ok · 2.1s` rather than as a bare `ok · 2.1s`.
   *
   * `Studio — default`'s settled `render` card carries the dot; `2A`'s carries it on all three.
   * `NodeCardHeader` owns the two-part treatment — the dot takes the status colour and the label
   * drops to `#79828a` — so this only says which form the card is in.
   */
  readonly statusDot?: boolean
}

/** A fallback column for a node the document has never placed. Not a layout algorithm. */
const FALLBACK_COLUMN_GAP = 320

export function toCanvasNodes(args: {
  descriptor: SafeFlowDescriptorPayload
  document: FlowDocument
  selectedNodeId?: string
  overlays?: ReadonlyMap<string, NodeOverlay>
  /** `3D` — what the last validation marked. Absent means nothing has been checked. */
  problems?: FlowProblemModel
}): readonly FlowCanvasNode[] {
  const startIds = new Set(args.descriptor.startIds)

  return args.descriptor.nodes.map((node, index) => {
    const overlay = args.overlays?.get(node.id)
    const mark = args.problems?.nodes.get(node.id)

    // `3D` marks a port, not a node, so each field looks its own mark up on the side it sits on.

    // Tone is left unset here: `resolveFieldTone` (`canvas/fields.ts`) already derives it from
    // `isStart`, which is what the `Studio — default` artboard actually renders — a start node's
    // output labels read active (`#c3c9ce`) and a downstream node's input labels read plain
    // (`#aab1b7`) even where the artboard draws an accent connection straight into them. Setting
    // `tone` here from connection/literal satisfaction would both contradict the design and shadow
    // that default.
    const inputs: readonly NodeFieldSpec[] = node.input.fields.map((field) => {
      const problem = args.problems?.fields.get(endpointKey(node.id, 'target', field.field))
      return {
        name: field.field,
        // A port with no source says so where its type would be — the one annotation `3D`
        // replaces that the wire can actually justify.
        annotation: problem?.annotation ?? overlay?.inputAnnotation ?? field.annotation,
        ...(problem === undefined ? {} : { problem: problem.problem }),
      }
    })

    const outputs: readonly NodeFieldSpec[] = node.output.fields.map((field) => {
      const problem = args.problems?.fields.get(endpointKey(node.id, 'source', field.field))
      return {
        name: field.field,
        annotation: problem?.annotation ?? overlay?.outputAnnotation ?? field.annotation,
        ...(problem === undefined ? {} : { problem: problem.problem }),
      }
    })

    const data: NodeCardData = {
      id: node.id,
      state: overlay?.state ?? 'idle',
      isStart: startIds.has(node.id),
      selected: args.selectedNodeId === node.id,
      inputs,
      outputs,
      ...(overlay?.status === undefined ? {} : { status: overlay.status }),
      ...(overlay?.elapsed === undefined ? {} : { elapsed: overlay.elapsed }),
      ...(overlay?.progress === undefined ? {} : { progress: overlay.progress }),
      ...(overlay?.detail === undefined ? {} : { detail: overlay.detail }),
      ...(overlay?.outputSlot === undefined ? {} : { outputSlot: overlay.outputSlot }),
      ...(overlay?.statusDot === undefined ? {} : { statusDot: overlay.statusDot }),
      ...(mark === undefined ? {} : { problem: mark.problem }),
      // Only the card that carries the finding prints a count; `3D`'s blocked card's trailing
      // cell is empty.
      ...(mark?.problem === 'error' ? { problemCount: mark.count } : {}),
    }

    return {
      id: node.id,
      position: args.document.layout[node.id] ?? { x: index * FALLBACK_COLUMN_GAP, y: 0 },
      data,
    }
  })
}

/**
 * `Node states` queued (design 671): the `Waiting on render.image` line, whose template is
 * `Waiting on <node>.<field>`.
 *
 * The document's connection list is the only place that fact lives. A queued node names the first
 * incoming connection whose source has not settled — the upstream it is actually blocked on — and
 * falls back to its first incoming connection once every upstream has. A node with no incoming
 * connection at all has nothing to wait on and gets `undefined`: the card then draws the dashed
 * chrome the design also fixes, rather than an invented line.
 */
export function waitingOnField(
  document: FlowDocument,
  nodeId: string,
  settledNodeIds?: ReadonlySet<string>,
): string | undefined {
  const incoming = document.connections.filter((connection) => connection.to.node === nodeId)
  const blocked = incoming.filter(
    (connection) => settledNodeIds?.has(connection.from.node) !== true,
  )
  const waiting = blocked[0] ?? incoming[0]
  return waiting === undefined ? undefined : `${waiting.from.node}.${waiting.from.field}`
}

export function toCanvasEdges(
  document: FlowDocument,
  problems?: FlowProblemModel,
): readonly FlowCanvasEdge[] {
  return document.connections.map((connection) => {
    const id = `${connection.from.node}.${connection.from.field}->${connection.to.node}.${connection.to.field}`
    return {
      id,
      source: connection.from.node,
      sourceField: connection.from.field,
      target: connection.to.node,
      targetField: connection.to.field,
      // `3D`: the failing edge is the failure hue at 1.4, where an accent edge is 1.3. Every other
      // edge keeps whatever tone `resolveEdgeTone` derives from the start node.
      ...(problems?.edges.has(id) === true ? { tone: 'error' as const } : {}),
    }
  })
}

/**
 * `### Left sidebar`: `Nodes in publication` shows a kind dot, the mono node id and the kind label.
 * `KindDotTone` has four values, but `queued` and `cached` are run states the sidebar never shows.
 */
export function toFlowNodeSummaries(
  descriptor: SafeFlowDescriptorPayload,
): readonly FlowNodeSummary[] {
  return descriptor.nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    dot: node.kind === 'start' ? 'start' : 'neutral',
  }))
}

/** `### Left sidebar`: `Inventory` is the flow's node definitions. Read-only reference in v1. */
export function toInventory(descriptor: SafeFlowDescriptorPayload): readonly InventoryEntry[] {
  const seen = new Set<string>()
  const entries: InventoryEntry[] = []
  for (const node of descriptor.nodes) {
    if (seen.has(node.title)) continue
    seen.add(node.title)
    entries.push({ name: node.title, kind: node.kind })
  }
  return entries
}

export function toFlowSummaries(flows: readonly FlowListItem[]): readonly FlowSummary[] {
  return flows.map((flow) => ({ id: flow.id, name: flow.name, nodeCount: flow.nodeCount }))
}
