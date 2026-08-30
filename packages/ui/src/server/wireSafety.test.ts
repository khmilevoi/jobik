import { describe, expect, it } from 'vitest'
import { findUnsafeValues } from './wireSafety.js'

describe('findUnsafeValues', () => {
  it('passes a payload made only of JSON scalars, arrays and objects', () => {
    expect(
      findUnsafeValues({
        id: 'publication',
        nodes: [{ id: 'render', annotation: 'Buffer', required: true, minimum: -1 }],
        documentFile: 'flow.jobik.json',
        ref: '#/$defs/__schema0',
      }),
    ).toEqual([])
  })

  it('flags a POSIX absolute path, wherever it is nested', () => {
    const findings = findUnsafeValues({ a: [{ b: '/home/dev/flows/index.ts' }] })
    expect(findings).toHaveLength(1)
    expect(findings[0].pointer).toBe('/a/0/b')
    expect(findings[0].reason).toContain('absolute path')
  })

  it('flags a Windows absolute path and a UNC path', () => {
    expect(findUnsafeValues({ a: 'C:\\Users\\dev\\flow.ts' })).toHaveLength(1)
    expect(findUnsafeValues({ a: 'C:/Users/dev/flow.ts' })).toHaveLength(1)
    expect(findUnsafeValues({ a: '\\\\server\\share\\flow.ts' })).toHaveLength(1)
  })

  it('flags a forbidden key even when its value is harmless', () => {
    const findings = findUnsafeValues({ error: { cause: 'nope', stack: 'nope' } })
    expect(findings.map((finding) => finding.pointer).sort()).toEqual([
      '/error/cause',
      '/error/stack',
    ])
  })

  it('flags a function', () => {
    expect(findUnsafeValues({ run: undefined, nested: { fn: () => 1 } })).toContainEqual({
      pointer: '/nested/fn',
      reason: 'function',
    })
  })

  it('flags a caller-supplied forbidden substring', () => {
    const findings = findUnsafeValues({ note: 'built in /tmp/jobik-abc' }, ['/tmp/jobik-abc'])
    expect(findings.some((finding) => finding.reason.includes('/tmp/jobik-abc'))).toBe(true)
  })

  it('ignores an empty forbidden substring rather than flagging everything', () => {
    expect(findUnsafeValues({ note: 'fine' }, [''])).toEqual([])
  })
})
