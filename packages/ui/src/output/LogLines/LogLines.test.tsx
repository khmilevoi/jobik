import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LogLines } from './LogLines.js'

afterEach(cleanup)

const lines = [
  { time: '0.00', message: 'start1 → emit title, markdown' },
  { time: '0.31', message: 'render layout pass complete' },
]

describe('LogLines', () => {
  it('prints a timestamp before each message', () => {
    render(<LogLines lines={lines} />)
    const rows = screen.getAllByTestId('output-log-line')
    expect(rows).toHaveLength(2)
    expect(rows[1]).toHaveTextContent('0.31 render layout pass complete')
  })

  it('renders an empty block when a run logged nothing', () => {
    render(<LogLines lines={[]} />)
    expect(screen.getByTestId('output-logs')).toBeEmptyDOMElement()
  })
})
