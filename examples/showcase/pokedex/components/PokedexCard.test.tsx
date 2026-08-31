import type { OutputComponentProps } from '@jobik/ui'
import { NodeOutputSlot, textColors } from '@jobik/ui'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { POKEDEX_CARD_ASSET_NAME, POKEDEX_TYPE_COLOURS } from '../types.js'
import { PokedexCard } from './PokedexCard.js'

afterEach(cleanup)

const image = { type: 'Buffer', mime: 'image/png', bytes: 62451, id: 'c1' } as const

const props: OutputComponentProps = {
  nodeId: 'compose',
  output: {
    image,
    caption: '#006 Charizard — fire / flying · 534 BST',
    primaryType: 'fire',
    secondaryType: 'flying',
  },
  surface: 'viewer',
  assetUrl: () => '/assets/c1',
}

describe('PokedexCard at the viewer surface', () => {
  it('renders the metadata row from the example`s own constants', () => {
    render(<PokedexCard {...props} />)
    expect(screen.getByTestId('output-metadata-row')).toHaveTextContent('720×420·png·61 kb')
    expect(screen.getByTestId('output-metadata-trailing')).toHaveTextContent('fire / flying')
  })

  it('counts one image, because compose emits one', () => {
    render(<PokedexCard {...props} />)
    expect(screen.getByTestId('output-primary-badge')).toHaveTextContent('1 / 1')
    expect(screen.getByTestId('output-variant-empty')).toHaveTextContent('no variant')
  })

  it('lists the caption, both types and the byte count as typed values', () => {
    render(<PokedexCard {...props} />)
    // Named after `compose`'s output fields: the grid keys its rows by name, so two rows both
    // called `type` would collide and React would warn.
    expect(screen.getAllByTestId('output-typed-name').map((n) => n.textContent)).toEqual([
      'caption',
      'primaryType',
      'secondaryType',
      'bytes',
    ])
    const values = screen.getAllByTestId('output-typed-value')
    expect(values[0]).toHaveTextContent('#006 Charizard')
    expect(values[1]).toHaveTextContent('fire')
    expect(values[2]).toHaveTextContent('flying')
  })

  it('omits the second type for a single-type pokémon', () => {
    render(
      <PokedexCard
        {...props}
        output={{ ...props.output, primaryType: 'electric', secondaryType: '' }}
      />,
    )
    expect(screen.getByTestId('output-metadata-trailing')).toHaveTextContent('electric')
    expect(screen.getAllByTestId('output-typed-name').map((n) => n.textContent)).toEqual([
      'caption',
      'primaryType',
      'bytes',
    ])
  })

  it('shows the resolved asset and falls back to the placeholder without one', () => {
    const { rerender } = render(<PokedexCard {...props} />)
    expect(screen.getByAltText(POKEDEX_CARD_ASSET_NAME)).toHaveAttribute('src', '/assets/c1')
    rerender(<PokedexCard {...props} assetUrl={() => undefined} />)
    expect(screen.getByTestId('image-frame-label')).toHaveTextContent(POKEDEX_CARD_ASSET_NAME)
  })
})

describe('PokedexCard at the card surface', () => {
  it('renders the card image alone in the inline slot, ruled in its own type colour', () => {
    render(
      <NodeOutputSlot
        slot={{ content: <PokedexCard {...props} surface="card" /> }}
        captionColor={textColors.metadata}
      />,
    )
    const rendered = screen.getByAltText('#006 Charizard — fire / flying · 534 BST')
    expect(rendered).toHaveStyle({ width: '100%', height: '100%', objectFit: 'cover' })
    expect(rendered).toHaveStyle({ borderBottom: `3px solid ${POKEDEX_TYPE_COLOURS.fire}` })
  })

  it('shows the striped placeholder in the slot until an asset url exists', () => {
    render(<PokedexCard {...props} surface="card" assetUrl={() => undefined} />)
    expect(screen.getByText(POKEDEX_CARD_ASSET_NAME)).toBeInTheDocument()
  })

  it('renders nothing about the caption or the variants at card size', () => {
    render(<PokedexCard {...props} surface="card" />)
    expect(screen.queryByTestId('output-preview')).toBeNull()
    expect(screen.queryByTestId('output-typed-values')).toBeNull()
  })
})
