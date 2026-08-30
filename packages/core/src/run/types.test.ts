import { describe, expect, it } from 'vitest'
import { type NodeStatus, nodeStatuses } from './types.js'

describe('nodeStatuses', () => {
  it('is the closed status set the spec fixes, in vocabulary order', () => {
    expect(nodeStatuses).toEqual(['queued', 'running', 'ok', 'failed', 'skipped', 'cached'])
  })

  it('covers every member of NodeStatus and nothing else', () => {
    // Exhaustive at compile time: a missing key fails typecheck, an extra key fails typecheck.
    const seen: Record<NodeStatus, true> = {
      queued: true,
      running: true,
      ok: true,
      failed: true,
      skipped: true,
      cached: true,
    }
    expect(Object.keys(seen).sort()).toEqual([...nodeStatuses].sort())
  })
})
