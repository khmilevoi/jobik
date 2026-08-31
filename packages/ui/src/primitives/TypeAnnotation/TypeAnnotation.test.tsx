import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TypeAnnotation } from './TypeAnnotation.js'

afterEach(cleanup)

describe('TypeAnnotation', () => {
  it('renders its children', () => {
    render(<TypeAnnotation data-testid="type">string</TypeAnnotation>)
    expect(screen.getByTestId('type')).toHaveTextContent('string')
  })
})
