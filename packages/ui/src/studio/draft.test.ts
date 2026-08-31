import type { FlowDocument } from '@jobik/core'
import { describe, expect, it } from 'vitest'
import {
  connectFields,
  createDraft,
  type FlowDraft,
  markSaved,
  moveNode,
  sameFlowShape,
  unsavedChangeCount,
} from './draft.js'

const DOCUMENT = {
  format: 'jobik.flow',
  version: 1,
  connections: [
    { from: { node: 'start1', field: 'title' }, to: { node: 'render', field: 'title' } },
  ],
  literals: { render: { quality: 90 } },
  layout: { start1: { x: 56, y: 248 }, render: { x: 386, y: 150 } },
} as unknown as FlowDocument

describe('createDraft', () => {
  it('starts clean at the revision the server reported', () => {
    const draft = createDraft(DOCUMENT, 'rev-1')

    expect(draft.dirty).toBe(false)
    expect(draft.baseRevision).toBe('rev-1')
    expect(draft.document).toBe(DOCUMENT)
  })
})

describe('moveNode', () => {
  it('records the new position and marks the draft dirty', () => {
    const draft = moveNode(createDraft(DOCUMENT, 'rev-1'), {
      nodeId: 'render',
      position: { x: 400, y: 160 },
    })

    expect(draft.dirty).toBe(true)
    expect(draft.document.layout.render).toEqual({ x: 400, y: 160 })
    expect(draft.document.layout.start1).toEqual({ x: 56, y: 248 })
  })

  it('leaves the source document untouched', () => {
    const before = createDraft(DOCUMENT, 'rev-1')
    moveNode(before, { nodeId: 'render', position: { x: 1, y: 2 } })

    expect(DOCUMENT.layout.render).toEqual({ x: 386, y: 150 })
    expect(before.dirty).toBe(false)
  })

  it('is a no-op when the position has not moved', () => {
    const before = createDraft(DOCUMENT, 'rev-1')
    const after = moveNode(before, { nodeId: 'render', position: { x: 386, y: 150 } })

    expect(after).toBe(before)
  })

  it('adds a new layout entry when the node id is not yet present, rather than silently dropping it', () => {
    const draft = moveNode(createDraft(DOCUMENT, 'rev-1'), {
      nodeId: 'newNode',
      position: { x: 10, y: 20 },
    })

    expect(draft.dirty).toBe(true)
    expect(draft.document.layout.newNode).toEqual({ x: 10, y: 20 })
    expect(draft.document.layout.render).toEqual({ x: 386, y: 150 })
  })

  it('preserves the literals object identity across an edit, proving the round-trip is byte-identical', () => {
    const before = createDraft(DOCUMENT, 'rev-1')
    const after = moveNode(before, { nodeId: 'render', position: { x: 1, y: 2 } })

    expect(after.document.literals).toBe(before.document.literals)
  })
})

describe('connectFields', () => {
  it('appends the connection and marks the draft dirty', () => {
    const draft = connectFields(createDraft(DOCUMENT, 'rev-1'), {
      source: 'render',
      sourceField: 'image',
      target: 'publish',
      targetField: 'image',
    })

    expect(draft.dirty).toBe(true)
    expect(draft.document.connections).toHaveLength(2)
    expect(draft.document.connections[1]).toEqual({
      from: { node: 'render', field: 'image' },
      to: { node: 'publish', field: 'image' },
    })
  })

  it('replaces the existing connection into the same target field', () => {
    const draft = connectFields(createDraft(DOCUMENT, 'rev-1'), {
      source: 'other',
      sourceField: 'text',
      target: 'render',
      targetField: 'title',
    })

    expect(draft.document.connections).toEqual([
      { from: { node: 'other', field: 'text' }, to: { node: 'render', field: 'title' } },
    ])
  })

  it('replaces the connection in place, preserving the array order of the connections around it', () => {
    const threeConnections = {
      ...DOCUMENT,
      connections: [
        { from: { node: 'a', field: 'x' }, to: { node: 'render', field: 'first' } },
        { from: { node: 'start1', field: 'title' }, to: { node: 'render', field: 'title' } },
        { from: { node: 'b', field: 'y' }, to: { node: 'render', field: 'last' } },
      ],
    } as unknown as FlowDocument

    const draft = connectFields(createDraft(threeConnections, 'rev-1'), {
      source: 'other',
      sourceField: 'text',
      target: 'render',
      targetField: 'title',
    })

    expect(draft.document.connections).toEqual([
      { from: { node: 'a', field: 'x' }, to: { node: 'render', field: 'first' } },
      { from: { node: 'other', field: 'text' }, to: { node: 'render', field: 'title' } },
      { from: { node: 'b', field: 'y' }, to: { node: 'render', field: 'last' } },
    ])
  })

  it('is a no-op when the identical connection already exists', () => {
    const before = createDraft(DOCUMENT, 'rev-1')
    const after = connectFields(before, {
      source: 'start1',
      sourceField: 'title',
      target: 'render',
      targetField: 'title',
    })

    expect(after).toBe(before)
  })

  it('round-trips literals unchanged', () => {
    const draft = connectFields(createDraft(DOCUMENT, 'rev-1'), {
      source: 'render',
      sourceField: 'image',
      target: 'publish',
      targetField: 'image',
    })

    expect(draft.document.literals).toEqual({ render: { quality: 90 } })
  })

  it('preserves the literals object identity, proving the round-trip is byte-identical, not merely deep-equal', () => {
    const before = createDraft(DOCUMENT, 'rev-1')
    const after = connectFields(before, {
      source: 'render',
      sourceField: 'image',
      target: 'publish',
      targetField: 'image',
    })

    expect(after.document.literals).toBe(before.document.literals)
  })

  it('records a connection to a node id absent from the document, deferring existence checks to the server', () => {
    const draft = connectFields(createDraft(DOCUMENT, 'rev-1'), {
      source: 'missing',
      sourceField: 'x',
      target: 'alsoMissing',
      targetField: 'y',
    })

    expect(draft.dirty).toBe(true)
    expect(draft.document.connections).toContainEqual({
      from: { node: 'missing', field: 'x' },
      to: { node: 'alsoMissing', field: 'y' },
    })
  })
})

describe('markSaved', () => {
  it('clears dirty and adopts the revision the server returned, when no edit landed during the save', () => {
    const edited = moveNode(createDraft(DOCUMENT, 'rev-1'), {
      nodeId: 'render',
      position: { x: 400, y: 160 },
    })
    const saved = markSaved(edited, edited.document, 'rev-2')

    expect(saved.dirty).toBe(false)
    expect(saved.baseRevision).toBe('rev-2')
    expect(saved.document).toBe(edited.document)
  })

  it('stays dirty but adopts the new revision when an edit lands while the save is in flight', () => {
    // The document captured at the moment save() was called and sent to the server.
    const sentDraft = moveNode(createDraft(DOCUMENT, 'rev-1'), {
      nodeId: 'render',
      position: { x: 400, y: 160 },
    })
    const sentDocument = sentDraft.document

    // The user edits again before the server responds; the current draft moves on.
    const currentDraft = moveNode(sentDraft, { nodeId: 'render', position: { x: 500, y: 200 } })

    const saved = markSaved(currentDraft, sentDocument, 'rev-2')

    expect(saved.dirty).toBe(true)
    expect(saved.baseRevision).toBe('rev-2')
    expect(saved.document).toBe(currentDraft.document)
    expect(saved.document.layout.render).toEqual({ x: 500, y: 200 })
  })

  it('preserves the literals object identity across a save', () => {
    const edited = moveNode(createDraft(DOCUMENT, 'rev-1'), {
      nodeId: 'render',
      position: { x: 400, y: 160 },
    })
    const saved = markSaved(edited, edited.document, 'rev-2')

    expect(saved.document.literals).toBe(edited.document.literals)
  })

  it('adopts the given revision and stays clean when saving a draft that was never dirty', () => {
    const clean = createDraft(DOCUMENT, 'rev-1')
    const saved = markSaved(clean, clean.document, 'rev-9')

    expect(saved.dirty).toBe(false)
    expect(saved.baseRevision).toBe('rev-9')
    expect(saved.baseRevision).not.toBe(clean.baseRevision)
  })
})

/**
 * `3D` — *"errors persist until the flow changes"*. This is what "the flow" means: the graph, not
 * where the cards sit on the canvas.
 */
describe('sameFlowShape', () => {
  it('holds across a drag, so a move never throws away a validation result', () => {
    const draft = createDraft(DOCUMENT, 'rev-1')
    const moved = moveNode(draft, { nodeId: 'start1', position: { x: 100, y: 100 } })

    expect(moved.document).not.toBe(draft.document)
    expect(sameFlowShape(draft.document, moved.document)).toBe(true)
  })

  it('breaks the moment a connection changes', () => {
    const draft = createDraft(DOCUMENT, 'rev-1')
    const connected = connectFields(draft, {
      source: 'start1',
      sourceField: 'markdown',
      target: 'render',
      targetField: 'markdown',
    })

    expect(sameFlowShape(draft.document, connected.document)).toBe(false)
  })

  it('breaks against a document read fresh off the disk, even an identical one', () => {
    const reloaded = { ...DOCUMENT, connections: [...DOCUMENT.connections] } as FlowDocument
    expect(sameFlowShape(DOCUMENT, reloaded)).toBe(false)
  })

  it('holds against itself', () => {
    expect(sameFlowShape(DOCUMENT, DOCUMENT)).toBe(true)
  })
})

/**
 * `3F`'s `4 unsaved changes` — the one number the Switch-flow dialog prints that nothing else in
 * the Studio already carried. It is a diff against the document on disk, never a tally of edits.
 */
describe('unsavedChangeCount', () => {
  it('counts nothing on a freshly loaded draft', () => {
    expect(unsavedChangeCount(createDraft(DOCUMENT, 'rev-1'))).toBe(0)
  })

  it('counts one per moved node', () => {
    const draft = moveNode(createDraft(DOCUMENT, 'rev-1'), {
      nodeId: 'render',
      position: { x: 400, y: 160 },
    })

    expect(unsavedChangeCount(draft)).toBe(1)
  })

  it('counts a node dragged twice once — it is a diff, not a tally of edits', () => {
    const once = moveNode(createDraft(DOCUMENT, 'rev-1'), {
      nodeId: 'render',
      position: { x: 400, y: 160 },
    })
    const twice = moveNode(once, { nodeId: 'render', position: { x: 500, y: 200 } })

    expect(unsavedChangeCount(twice)).toBe(1)
  })

  it('counts a node dragged back to where it started as nothing', () => {
    const away = moveNode(createDraft(DOCUMENT, 'rev-1'), {
      nodeId: 'render',
      position: { x: 400, y: 160 },
    })
    const back = moveNode(away, { nodeId: 'render', position: { x: 386, y: 150 } })

    expect(unsavedChangeCount(back)).toBe(0)
  })

  it('counts a node the saved layout never held', () => {
    const draft = moveNode(createDraft(DOCUMENT, 'rev-1'), {
      nodeId: 'publish',
      position: { x: 700, y: 150 },
    })

    expect(unsavedChangeCount(draft)).toBe(1)
  })

  it('counts an added connection', () => {
    const draft = connectFields(createDraft(DOCUMENT, 'rev-1'), {
      source: 'render',
      sourceField: 'image',
      target: 'publish',
      targetField: 'image',
    })

    expect(unsavedChangeCount(draft)).toBe(1)
  })

  it('counts a rewired target once, not as a removal plus an addition', () => {
    const draft = connectFields(createDraft(DOCUMENT, 'rev-1'), {
      source: 'other',
      sourceField: 'title',
      target: 'render',
      targetField: 'title',
    })

    expect(unsavedChangeCount(draft)).toBe(1)
  })

  it('counts a connection the draft no longer carries', () => {
    const loaded = createDraft(DOCUMENT, 'rev-1')
    const dropped: FlowDraft = {
      ...loaded,
      dirty: true,
      document: { ...loaded.document, connections: [] },
    }

    expect(unsavedChangeCount(dropped)).toBe(1)
  })

  it('adds the two kinds together', () => {
    const moved = moveNode(createDraft(DOCUMENT, 'rev-1'), {
      nodeId: 'render',
      position: { x: 400, y: 160 },
    })
    const wired = connectFields(moved, {
      source: 'render',
      sourceField: 'image',
      target: 'publish',
      targetField: 'image',
    })

    expect(unsavedChangeCount(wired)).toBe(2)
  })

  it('drops back to nothing once the draft is written', () => {
    const edited = moveNode(createDraft(DOCUMENT, 'rev-1'), {
      nodeId: 'render',
      position: { x: 400, y: 160 },
    })

    expect(unsavedChangeCount(markSaved(edited, edited.document, 'rev-2'))).toBe(0)
  })

  it('counts only what is still unwritten when an edit lands while the save is in flight', () => {
    const sent = moveNode(createDraft(DOCUMENT, 'rev-1'), {
      nodeId: 'render',
      position: { x: 400, y: 160 },
    })
    const current = moveNode(sent, { nodeId: 'start1', position: { x: 60, y: 260 } })

    // `render` reached the disk; `start1` did not.
    expect(unsavedChangeCount(markSaved(current, sent.document, 'rev-2'))).toBe(1)
  })
})
