import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RunRunningState } from '#run/types.js'
import { progressWidth, RunRunningView } from './RunRunningView.js'

afterEach(cleanup)

/** `Studio — run in progress` lines 595–648, plus `Run panel — states` lines 779–793. */
function state(overrides: Partial<RunRunningState> = {}): RunRunningState {
  return {
    kind: 'running',
    runNumber: 219,
    elapsed: '1.3s',
    completedNodes: 1,
    totalNodes: 3,
    progress: 0.54,
    nodes: [
      { nodeId: 'start1', status: 'ok', elapsed: '0.0s' },
      { nodeId: 'render', status: 'running', elapsed: '1.3s' },
      { nodeId: 'publish', status: 'queued' },
    ],
    log: {
      followLabel: 'follow',
      lines: [
        { time: '0.00', text: 'start1 → emit title, markdown' },
        { time: '0.01', text: 'render ← inputs bound (2)' },
        { time: '0.31', text: 'render layout pass complete' },
        { time: '1.28', text: 'render rasterising frame 2/3' },
      ],
      pending: 'waiting for imageOut',
    },
    ...overrides,
  }
}

describe('progressWidth', () => {
  it('turns the unit range into a percentage', () => {
    expect(progressWidth(0.54)).toBe('54%')
    expect(progressWidth(0)).toBe('0%')
    expect(progressWidth(1)).toBe('100%')
  })

  it('clamps a value outside the unit range', () => {
    expect(progressWidth(1.4)).toBe('100%')
    expect(progressWidth(-0.2)).toBe('0%')
  })
})

describe('RunRunningView', () => {
  it('heads the body with the node count and the elapsed time', () => {
    render(<RunRunningView state={state()} />)
    expect(screen.getByTestId('run-progress-summary').textContent).toBe('1 of 3 nodes complete')
    expect(screen.getByTestId('run-progress-elapsed').textContent).toBe('1.3s')
  })

  it('drives the bar from progress, not from the node counts, through the custom property', () => {
    render(<RunRunningView state={state()} />)
    expect(screen.getByTestId('run-progress-bar')).toBeInTheDocument()
    expect(
      screen.getByTestId('run-progress-fill').style.getPropertyValue('--jbk-run-progress'),
    ).toBe('54%')
  })

  it('renders the node rows', () => {
    render(<RunRunningView state={state()} />)
    expect(screen.getByTestId('run-node-rows')).toBeInTheDocument()
    expect(screen.getByTestId('run-node-row-render')).toBeInTheDocument()
  })

  it('draws the live log with its timestamps and a caret on the pending line', () => {
    render(<RunRunningView state={state()} />)
    expect(screen.getByTestId('run-log-label').textContent).toBe('Live log')
    expect(screen.getByTestId('run-log-follow').textContent).toBe('follow')
    expect(screen.getByTestId('run-log-time-0').textContent).toBe('0.00 ')
    expect(screen.getByTestId('run-log-line-3').textContent).toContain(
      'render rasterising frame 2/3',
    )
    expect(screen.getByTestId('run-log-pending').textContent).toContain('waiting for imageOut')
    expect(screen.getByTestId('run-log-caret')).toBeInTheDocument()
  })

  it('omits the log block and its divider when no log is supplied', () => {
    render(<RunRunningView state={state({ log: undefined })} />)
    expect(screen.queryByTestId('run-log-label')).toBeNull()
    expect(screen.queryByTestId('run-panel-divider')).toBeNull()
  })

  it('draws the explanatory line and the partial output well when asked', () => {
    const note =
      'Streaming output as each node settles. Inputs are locked for the duration of the run.'
    render(<RunRunningView state={state({ note, partialOutput: true })} />)
    expect(screen.getByTestId('run-panel-note').textContent).toBe(note)
    expect(screen.getByTestId('run-partial-output-label').textContent).toBe('Partial output')
    expect(screen.getByTestId('run-partial-media')).toBeInTheDocument()
    expect(screen.getByTestId('run-partial-caption')).toBeInTheDocument()
  })

  it('omits the note and the partial output by default', () => {
    render(<RunRunningView state={state()} />)
    expect(screen.queryByTestId('run-panel-note')).toBeNull()
    expect(screen.queryByTestId('run-partial-output-label')).toBeNull()
  })

  /**
   * `Run panel — states`' running card, design 779–793: the bar stands alone and the nodes are the
   * compact mono list, where `Studio — run in progress` heads the bar and draws 30px rows.
   */
  it('drops the head row and draws the compact timings in the card variant', () => {
    render(<RunRunningView state={state()} variant="card" />)
    expect(screen.queryByTestId('run-progress-summary')).toBeNull()
    expect(screen.queryByTestId('run-node-rows')).toBeNull()
    expect(screen.getByTestId('run-progress-bar')).toBeInTheDocument()
    expect(screen.getByTestId('run-timing-value-publish').textContent).toBe('queued')
  })

  it('closes with Cancel run, its esc hint, and its click', async () => {
    const onCancel = vi.fn()
    render(<RunRunningView state={state({ onCancel })} />)
    const button = screen.getByTestId('run-cancel-button')
    expect(screen.getByText('esc')).toBeInTheDocument()
    await userEvent.click(button)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
