import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Badge } from './Badge.js'

afterEach(cleanup)

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge data-testid="badge">flow.ts</Badge>)
    expect(screen.getByTestId('badge')).toHaveTextContent('flow.ts')
  })
})
