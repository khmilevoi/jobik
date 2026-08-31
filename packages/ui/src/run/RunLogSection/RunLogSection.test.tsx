import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { RunLog } from '#run/types.js'
import { RunLogSection } from './RunLogSection.js'

afterEach(cleanup)

/** `Studio — run in progress`, 634–641. `2A` heads the same block `Log` / `tail` and drops the caret. */
const LOG: RunLog = {
  followLabel: 'follow',
  lines: [
    { time: '0.00', text: 'start1 → emit title, markdown' },
    { time: '0.31', text: 'render layout pass complete' },
  ],
  pending: 'waiting for imageOut',
}

describe('RunLogSection', () => {
  it('heads the block with the label it is given and the follow label on the right', () => {
    render(<RunLogSection log={LOG} label="Live log" />)
    expect(screen.getByTestId('run-log-label').textContent).toBe('Live log')
    expect(screen.getByTestId('run-log-follow').textContent).toBe('follow')
  })

  it('takes the completed dock label without changing anything else', () => {
    render(<RunLogSection log={{ ...LOG, followLabel: 'tail' }} label="Log" />)
    expect(screen.getByTestId('run-log-label').textContent).toBe('Log')
    expect(screen.getByTestId('run-log-follow').textContent).toBe('tail')
  })

  it('renders every line as a timestamp cell and the message the caller composed', () => {
    render(<RunLogSection log={LOG} label="Log" />)
    expect(screen.getByTestId('run-log-time-0').textContent).toBe('0.00 ')
    expect(screen.getByTestId('run-log-line-0').textContent).toBe(
      '0.00 start1 → emit title, markdown',
    )
    expect(screen.getByTestId('run-log-line-1').textContent).toContain(
      'render layout pass complete',
    )
  })

  it('closes with the pulsing caret and the pending message when one is unsettled', () => {
    render(<RunLogSection log={LOG} label="Live log" />)
    expect(screen.getByTestId('run-log-pending').textContent).toContain('waiting for imageOut')
    expect(screen.getByTestId('run-log-caret')).toBeInTheDocument()
  })

  it('omits the caret, the pending line and the follow label when none is supplied', () => {
    render(<RunLogSection log={{ lines: LOG.lines }} label="Log" />)
    expect(screen.queryByTestId('run-log-pending')).toBeNull()
    expect(screen.queryByTestId('run-log-caret')).toBeNull()
    expect(screen.queryByTestId('run-log-follow')).toBeNull()
  })
})
