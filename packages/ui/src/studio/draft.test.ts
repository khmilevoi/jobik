import type { FlowDocument } from '@jobik/core'
import { describe, expect, it } from 'vitest'
import { connectFields, createDraft, markSaved, moveNode } from './draft.js'

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
  it('clears dirty and adopts the revision the server returned', () => {
    const edited = moveNode(createDraft(DOCUMENT, 'rev-1'), {
      nodeId: 'render',
      position: { x: 400, y: 160 },
    })
    const saved = markSaved(edited, 'rev-2')

    expect(saved.dirty).toBe(false)
    expect(saved.baseRevision).toBe('rev-2')
    expect(saved.document).toBe(edited.document)
  })

  it('preserves the literals object identity across a save', () => {
    const edited = moveNode(createDraft(DOCUMENT, 'rev-1'), {
      nodeId: 'render',
      position: { x: 400, y: 160 },
    })
    const saved = markSaved(edited, 'rev-2')

    expect(saved.document.literals).toBe(edited.document.literals)
  })

  it('adopts the given revision even when the draft was never edited', () => {
    const clean = createDraft(DOCUMENT, 'rev-1')
    const saved = markSaved(clean, 'rev-9')

    expect(saved.baseRevision).toBe('rev-9')
    expect(saved.baseRevision).not.toBe(clean.baseRevision)
  })
})
