import type { FlowConnection, FlowDocument } from '@jobik/core'
import type { FieldConnection, NodeLayoutChange } from '#canvas/index.js'

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
  /**
   * The document as it stands **on disk**, at `baseRevision` — what was loaded, or what the last
   * successful save actually wrote.
   *
   * `dirty` says *whether* the draft has moved away from it; this is what lets `3F`'s dialog say
   * *how far*. It is deliberately not derived from `dirty`'s own bookkeeping: an edit that lands
   * while a save is in flight leaves the draft dirty against a document that did reach the disk,
   * and only the written document can tell those two apart.
   */
  readonly savedDocument: FlowDocument
  /** The revision the document was loaded or last saved at. Sent as `expectedRevision`. */
  readonly baseRevision: string
  readonly dirty: boolean
}

export function createDraft(document: FlowDocument, revision: string): FlowDraft {
  return { document, savedDocument: document, baseRevision: revision, dirty: false }
}

/**
 * Whether two documents describe the same **flow** — `3D`'s *"errors persist until the flow
 * changes"*, made precise.
 *
 * A `FlowDocument` holds `connections`, `literals` and `layout`. Dragging a card rewrites `layout`
 * and nothing else, and a canvas position cannot make a graph valid or invalid, so a move must not
 * throw away a validation result the user is still reading. The other two can, and `connectFields`
 * replaces the `connections` array wholesale, so identity is the whole comparison: every edit in
 * this module either produces a new array or preserves the old one exactly.
 *
 * Reloading from disk or switching flows builds a whole new document, so both compare unequal and
 * both clear the result — which is right in both cases.
 */
export function sameFlowShape(left: FlowDocument, right: FlowDocument): boolean {
  return left.connections === right.connections && left.literals === right.literals
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
    savedDocument,
    baseRevision: revision,
    dirty: draft.document !== savedDocument,
  }
}

/**
 * How many edits the draft is holding back from disk — artboard `3F`'s `4 unsaved changes`.
 *
 * A **diff**, not a tally: dragging one card twice is one unsaved change, and dragging it back to
 * where it started is none. `savedDocument` is the other side of the comparison, so a save that
 * landed while the user kept editing leaves exactly the edits it did not carry.
 *
 * Two kinds are counted, because two kinds are all the canvas can make (`moveNode` and
 * `connectFields`):
 *
 *   * one per node whose position differs, in either direction — a moved card, a card the saved
 *     layout has no entry for, or an entry the draft has dropped;
 *   * one per **target field**, which is the unit a connection is written in: a field accepts at
 *     most one incoming edge, so rewiring one is a single change rather than a removal plus an
 *     addition.
 *
 * `literals` is not counted. Nothing in the Studio edits it — `## Layout` gives the node card no
 * literal editor — so a count for it would be a number that can only ever be zero.
 */
export function unsavedChangeCount(draft: FlowDraft): number {
  return (
    movedNodeCount(draft.savedDocument, draft.document) +
    rewiredFieldCount(draft.savedDocument, draft.document)
  )
}

function movedNodeCount(saved: FlowDocument, current: FlowDocument): number {
  const nodeIds = new Set([...Object.keys(saved.layout), ...Object.keys(current.layout)])
  let moved = 0
  for (const nodeId of nodeIds) {
    const before = saved.layout[nodeId]
    const after = current.layout[nodeId]
    if (before?.x !== after?.x || before?.y !== after?.y) moved += 1
  }
  return moved
}

/** Keyed by the incoming end, which is the one a `FlowDocument` allows only once. */
function byTargetField(document: FlowDocument): ReadonlyMap<string, string> {
  const bound = new Map<string, string>()
  for (const edge of document.connections) {
    bound.set(`${edge.to.node}.${edge.to.field}`, `${edge.from.node}.${edge.from.field}`)
  }
  return bound
}

function rewiredFieldCount(saved: FlowDocument, current: FlowDocument): number {
  const before = byTargetField(saved)
  const after = byTargetField(current)
  const fields = new Set([...before.keys(), ...after.keys()])
  let rewired = 0
  for (const field of fields) {
    if (before.get(field) !== after.get(field)) rewired += 1
  }
  return rewired
}
