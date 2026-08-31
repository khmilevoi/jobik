import { describe, expect, it, vi } from 'vitest'
import { toValidationFindings } from './validation.js'

describe('toValidationFindings', () => {
  it('turns the one error the wire carries into one finding', () => {
    const findings = toValidationFindings({
      error: { _tag: 'ConnectionError', message: 'render.markdown expects string' },
    })

    expect(findings).toHaveLength(1)
    expect(findings[0]?.severity).toBe('error')
    expect(findings[0]?.code).toBe('ConnectionError')
    expect(findings[0]?.message).toStrictEqual([{ text: 'render.markdown expects string' }])
    expect(findings[0]?.actions).toBeUndefined()
  })

  it('names an untagged error rather than leaving the code blank', () => {
    const findings = toValidationFindings({ error: { _tag: null, message: 'nope' } })

    expect(findings[0]?.code).toBe('ValidationError')
  })

  it('sets the named node in mono and keeps the sentence verbatim', () => {
    const findings = toValidationFindings({
      error: { _tag: 'GraphValidationError', message: 'render has no source', nodeId: 'render' },
    })

    expect(findings[0]?.message).toStrictEqual([
      { text: 'render', mono: true },
      { text: ' has no source' },
    ])
    expect(findings[0]?.message.map((segment) => segment.text).join('')).toBe(
      'render has no source',
    )
  })

  it('offers Reveal node only when a node is named and a handler exists', () => {
    const onRevealNode = vi.fn()
    const withNode = toValidationFindings({
      error: { _tag: 'GraphValidationError', message: 'x', nodeId: 'render' },
      onRevealNode,
    })
    withNode[0]?.actions?.[0]?.onSelect?.()

    expect(withNode[0]?.actions).toHaveLength(1)
    expect(withNode[0]?.actions?.[0]?.label).toBe('Reveal node')
    expect(onRevealNode).toHaveBeenCalledWith('render')

    // No node named, so no link — the artboard's `Open in editor` is never offered either, because
    // the Studio has no editor to open.
    expect(
      toValidationFindings({ error: { _tag: 'X', message: 'x' }, onRevealNode })[0]?.actions,
    ).toBeUndefined()
  })

  it('ignores a nodeId that is not a string', () => {
    const findings = toValidationFindings({
      error: { _tag: 'X', message: 'x', nodeId: 7 },
    })

    expect(findings[0]?.message).toStrictEqual([{ text: 'x' }])
  })
})
