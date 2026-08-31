import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkedAgo, StatusStrip } from './StatusStrip.js'

afterEach(cleanup)

/**
 * `3D` §3D.3, the valid board's strip. Every number it prints comes from the caller, so the test
 * is that it prints exactly what it was given — singular where the count is one — and that the
 * `checked … ago` clock actually advances.
 */
describe('StatusStrip', () => {
  it('says what was checked, in the design own words', () => {
    render(<StatusStrip nodeCount={2} connectionCount={2} checkedAt={0} now={() => 12_000} />)

    expect(screen.getByTestId('studio-status-label')).toHaveTextContent('No issues')
    expect(screen.getByTestId('studio-status-meta')).toHaveTextContent(
      '2 nodes · 2 connections · checked 12 s ago',
    )
    expect(screen.getByText('⌘⇧V')).toBeInTheDocument()
  })

  it('writes one of each in the singular', () => {
    render(<StatusStrip nodeCount={1} connectionCount={1} checkedAt={0} now={() => 0} />)

    expect(screen.getByTestId('studio-status-meta')).toHaveTextContent(
      '1 node · 1 connection · checked 0 s ago',
    )
  })

  it('counts up while the result stands', () => {
    vi.useFakeTimers()
    let now = 0
    try {
      render(<StatusStrip nodeCount={2} connectionCount={1} checkedAt={0} now={() => now} />)
      expect(screen.getByTestId('studio-status-meta')).toHaveTextContent('checked 0 s ago')

      now = 3_000
      act(() => {
        vi.advanceTimersByTime(3_000)
      })
      expect(screen.getByTestId('studio-status-meta')).toHaveTextContent('checked 3 s ago')
    } finally {
      vi.useRealTimers()
    }
  })

  it('never reports a negative age when the clock jumps backwards', () => {
    expect(checkedAgo(1_000, 0)).toBe('checked 0 s ago')
    expect(checkedAgo(0, 1_999)).toBe('checked 1 s ago')
  })
})
