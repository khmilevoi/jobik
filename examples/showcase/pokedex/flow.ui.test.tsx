import { isFlowUiDescriptor } from '@jobik/ui'
import { describe, expect, it } from 'vitest'
import { PokedexCard } from './components/PokedexCard.js'
import flowUi from './flow.ui.js'

describe('the pokedex flow UI extension', () => {
  it('is a descriptor the loader will accept', () => {
    expect(isFlowUiDescriptor(flowUi)).toBe(true)
  })

  it('registers PokedexCard under the flow node id the builder assigns', () => {
    expect(Object.keys(flowUi.nodes)).toEqual(['compose'])
    expect(flowUi.nodes.compose.Output).toBe(PokedexCard)
  })

  it('registers nothing for pipeline B, which is what leaves it on the generic viewer', () => {
    expect(flowUi.nodes.standings).toBeUndefined()
    expect(flowUi.nodes.rank).toBeUndefined()
  })
})
