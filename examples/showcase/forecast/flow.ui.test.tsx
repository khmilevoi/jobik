import { isFlowUiDescriptor } from '@jobik/ui'
import { describe, expect, it } from 'vitest'
import flowUi from './flow.ui.js'

describe('the forecast flow UI extension', () => {
  it('is a descriptor the loader will accept', () => {
    expect(isFlowUiDescriptor(flowUi)).toBe(true)
  })

  it('registers no component at all, which is the point of this example', () => {
    // `publication` registers an `Output` for its image node. This flow emits only numbers and
    // strings, and exists to show what the Studio's generic value viewer does with them. A
    // component registered here would hide exactly that, so an empty map is the assertion.
    expect(Object.keys(flowUi.nodes)).toEqual([])
  })
})
