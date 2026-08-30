import { describe, expect, it } from 'vitest'
import { topologicalOrder } from './topology.js'

describe('topologicalOrder()', () => {
  it('orders a chain', () => {
    const result = topologicalOrder(
      ['a', 'b', 'c'],
      new Map([
        ['a', ['b']],
        ['b', ['c']],
      ]),
    )
    expect(result).toEqual({ kind: 'order', order: ['a', 'b', 'c'] })
  })

  it('keeps declaration order among independent nodes', () => {
    const result = topologicalOrder(['a', 'b', 'c'], new Map<string, string[]>())
    expect(result).toEqual({ kind: 'order', order: ['a', 'b', 'c'] })
  })

  it('produces one deterministic order for a branching graph', () => {
    const result = topologicalOrder(
      ['s1', 's2', 'a', 'b', 'c', 'd'],
      new Map([
        ['s1', ['a']],
        ['s2', ['c']],
        ['a', ['b', 'd']],
        ['c', ['d']],
      ]),
    )
    expect(result).toEqual({ kind: 'order', order: ['s1', 's2', 'a', 'c', 'b', 'd'] })
  })

  it('reports a two-node cycle, closed', () => {
    const result = topologicalOrder(
      ['a', 'b'],
      new Map([
        ['a', ['b']],
        ['b', ['a']],
      ]),
    )
    expect(result).toEqual({ kind: 'cycle', cycle: ['a', 'b', 'a'] })
  })

  it('reports a self-loop as a cycle and does not hang', () => {
    const result = topologicalOrder(['a', 'b'], new Map([['a', ['a']]]))
    expect(result).toEqual({ kind: 'cycle', cycle: ['a', 'a'] })
  })

  it('finds a cycle that sits downstream of settled nodes', () => {
    const result = topologicalOrder(
      ['root', 'x', 'y'],
      new Map([
        ['root', ['x']],
        ['x', ['y']],
        ['y', ['x']],
      ]),
    )
    expect(result).toEqual({ kind: 'cycle', cycle: ['x', 'y', 'x'] })
  })
})
