import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Studio } from './Studio.js'

describe('Studio', () => {
  it('mounts an empty root', () => {
    render(<Studio />)
    expect(screen.getByTestId('studio-root')).toBeInTheDocument()
  })
})
