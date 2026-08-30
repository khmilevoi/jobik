import type { FlowConnection, FlowDocument } from '@jobik/core'
import type { FieldConnection, NodeLayoutChange } from '../canvas/index.js'

/**
 * `## UI and persistence`: the editor keeps a draft in memory, marks it dirty after an edit, and
 * writes only on Save. The draft is a value — every edit returns a new one and the previous
 * document object is never mutated, which is what lets `StudioApp` memoise on document identity.
 *
 * `literals` is carried through untouched. The design gives the node card no literal editor, so
 * the only two edits the canvas can make are the two callbacks `FlowCanvas` exposes.
 */

export type FlowDraft = {
  readonly document: FlowDocument
  /** The revision the document was loaded or last saved at. Sent as `expectedRevision`. */
  readonly baseRevision: string
  readonly dirty: boolean
}

export function createDraft(document: FlowDocument, revision: string): FlowDraft {
  return { document, baseRevision: revision, dirty: false }
}

export function moveNode(draft: FlowDraft, change: NodeLayoutChange): FlowDraft {
  const current = draft.document.layout[change.nodeId]
  if (current?.x === change.position.x && current.y === change.position.y) return draft

  return {
    ...draft,
    dirty: true,
    document: {
      ...draft.document,
      layout: {
        ...draft.document.layout,
        [change.nodeId]: { x: change.position.x, y: change.position.y },
      },
    },
  }
}

/**
 * A field accepts at most one incoming connection, so connecting into a bound target field replaces
 * the edge that was there. Reconnecting the identical edge is a no-op and must not mark the draft
 * dirty — React Flow can re-fire a connection when a drag ends back on its own handle.
 */
export function connectFields(draft: FlowDraft, connection: FieldConnection): FlowDraft {
  const next: FlowConnection = {
    from: { node: connection.source, field: connection.sourceField },
    to: { node: connection.target, field: connection.targetField },
  }

  const index = draft.document.connections.findIndex(
    (edge) => edge.to.node === next.to.node && edge.to.field === next.to.field,
  )
  const existing = index === -1 ? undefined : draft.document.connections[index]
  if (existing?.from.node === next.from.node && existing.from.field === next.from.field) {
    return draft
  }

  // Replace in place so an edit to one edge does not reorder the rest of the array — the
  // document schema preserves connection order, and a save should only rewrite what changed.
  const connections =
    index === -1
      ? [...draft.document.connections, next]
      : draft.document.connections.map((edge, i) => (i === index ? next : edge))

  return {
    ...draft,
    dirty: true,
    document: { ...draft.document, connections },
  }
}

/**
 * `save()` (task 11) captures the document at the moment it is sent to the server, and this is
 * applied once the response arrives. `savedDocument` is that captured document; comparing it by
 * identity to the draft's *current* document tells whether an edit landed while the request was
 * in flight. If nothing changed, the draft becomes clean at the new revision. If an edit landed
 * mid-flight, the new revision is still adopted (so the next save is against the right base) but
 * `dirty` stays `true`, so the pending edit is not silently lost.
 */
export function markSaved(
  draft: FlowDraft,
  savedDocument: FlowDocument,
  revision: string,
): FlowDraft {
  return {
    document: draft.document,
    baseRevision: revision,
    dirty: draft.document !== savedDocument,
  }
}
