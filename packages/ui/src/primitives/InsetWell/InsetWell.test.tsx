import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { InsetWell } from './InsetWell.js'

afterEach(cleanup)

describe('InsetWell', () => {
  it('renders its children', () => {
    render(<InsetWell data-testid="well">Typed flows, quietly</InsetWell>)
    expect(screen.getByTestId('well')).toHaveTextContent('Typed flows, quietly')
  })
})
