import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ProseText } from './ProseText.js'

afterEach(cleanup)

const sentence = [
  { text: 'render.markdown', mono: true },
  { text: ' expects string, receives ' },
  { text: 'Buffer', mono: true },
  { text: ' from ' },
  { text: 'start1.markdown', mono: true },
  { text: '.' },
] as const

describe('ProseText', () => {
  it('reads as one sentence', () => {
    render(<ProseText data-testid="prose" segments={sentence} />)
    expect(screen.getByTestId('prose')).toHaveTextContent(
      'render.markdown expects string, receives Buffer from start1.markdown.',
    )
  })

  it('wraps every mono run and nothing else', () => {
    const { container } = render(<ProseText segments={sentence} />)
    const spans = container.querySelectorAll('span span')
    expect([...spans].map((node) => node.textContent)).toEqual([
      'render.markdown',
      'Buffer',
      'start1.markdown',
    ])
  })

  it('keeps two identical identifiers distinct', () => {
    const { container } = render(
      <ProseText
        segments={[
          { text: 'render', mono: true },
          { text: ' then ' },
          { text: 'render', mono: true },
        ]}
      />,
    )
    expect(container.querySelectorAll('span span')).toHaveLength(2)
  })

  it('renders a plain sentence with no mono runs at all', () => {
    const { container } = render(
      <ProseText data-testid="prose" segments={[{ text: 'no identifiers here.' }]} />,
    )
    expect(screen.getByTestId('prose')).toHaveTextContent('no identifiers here.')
    expect(container.querySelectorAll('span span')).toHaveLength(0)
  })
})
