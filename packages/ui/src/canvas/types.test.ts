import { describe, expect, it } from 'vitest'
import type { FieldEdgeData, NodeCardData } from './types.js'
import { RUN_ANNOTATIONS } from './types.js'

describe('RUN_ANNOTATIONS', () => {
  it('names the three run-time annotations the spec fixes', () => {
    expect(RUN_ANNOTATIONS).toEqual({
      received: 'received',
      pending: 'pending',
      waiting: 'waiting',
    })
  })
})

describe('React Flow data compatibility', () => {
  it('lets NodeCardData and FieldEdgeData satisfy Record<string, unknown>', () => {
    // React Flow's `Node<T>` and `Edge<T>` constrain `T extends Record<string, unknown>`.
    // Only a `type` alias gets the implicit index signature that makes this
    // compile; declaring either of these as an `interface` breaks `FlowCanvas`
    // in Task 13. These two assignments are the compile-time assertion — the
    // runtime checks below are incidental.
    const card: NodeCardData = { id: 'render', state: 'ok' }
    const edgeData: FieldEdgeData = { tone: 'idle', shape: 'curved' }
    const node: Record<string, unknown> = card
    const edge: Record<string, unknown> = edgeData
    expect(node.id).toBe('render')
    expect(edge.tone).toBe('idle')
  })
})
