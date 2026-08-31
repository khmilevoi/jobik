import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProblemRow } from './ProblemsStrip.js'
import { ProblemsStrip, problemCountLabel } from './ProblemsStrip.js'

afterEach(cleanup)

const three: readonly ProblemRow[] = [
  {
    severity: 'error',
    code: 'TypeMismatch',
    message: 'render.markdown receives Buffer',
    source: 'flow.ts:41',
  },
  { severity: 'error', code: 'UnconnectedInput', message: 'publish.caption has no source' },
  { severity: 'warning', code: 'UnusedOutput', message: 'render.caption is never read' },
]

/**
 * `3D` §3D.3, the invalid board's strip. The header count is the thing worth pinning: it is
 * derived from the rows, so a strip can never claim more findings than it was handed.
 */
describe('ProblemsStrip', () => {
  it('counts the rows it was given, comma-joined', () => {
    render(<ProblemsStrip problems={three} />)

    expect(screen.getByTestId('studio-problems-count')).toHaveTextContent('2 errors, 1 warning')
    expect(screen.getAllByTestId('studio-problem-row')).toHaveLength(3)
  })

  it('says 1 error when that is all there is, and never mentions warnings it does not have', () => {
    render(<ProblemsStrip problems={[three[0] as ProblemRow]} />)

    expect(screen.getByTestId('studio-problems-count')).toHaveTextContent('1 error')
    expect(screen.getByTestId('studio-problems-count').textContent).not.toContain('warning')
  })

  it('derives every plural form from the list alone', () => {
    expect(problemCountLabel([])).toBe('')
    expect(problemCountLabel(three)).toBe('2 errors, 1 warning')
    expect(problemCountLabel([three[2] as ProblemRow])).toBe('1 warning')
    expect(
      problemCountLabel([three[2] as ProblemRow, { ...(three[2] as ProblemRow), code: 'Other' }]),
    ).toBe('2 warnings')
  })

  it('draws a row code, its message and its source, and omits a source nothing can supply', () => {
    render(<ProblemsStrip problems={three} />)

    expect(screen.getByText('TypeMismatch')).toBeInTheDocument()
    expect(screen.getByText('render.markdown receives Buffer')).toBeInTheDocument()
    expect(screen.getByText('flow.ts:41')).toBeInTheDocument()
    // The second row carries no `source`, so no location cell is drawn for it at all.
    expect(screen.queryByText('flow.ts:58')).toBeNull()
  })

  it('opens the report from the header action, and drops the action when nothing can open one', async () => {
    const onOpenReport = vi.fn()
    render(<ProblemsStrip problems={three} onOpenReport={onOpenReport} />)

    await userEvent.click(screen.getByRole('button', { name: 'Open report' }))
    expect(onOpenReport).toHaveBeenCalledTimes(1)

    cleanup()
    render(<ProblemsStrip problems={three} />)
    expect(screen.queryByTestId('studio-problems-open-report')).toBeNull()
  })
})
