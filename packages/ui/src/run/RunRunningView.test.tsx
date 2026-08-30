import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RunRunningView } from './RunRunningView.js'
import type { RunRunningState } from './types.js'

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

describe('RunRunningView', () => {
  it('heads the body with the node count and the elapsed time', () => {
    render(<RunRunningView state={state()} />)
    const summary = screen.getByTestId('run-progress-summary')
    expect(summary.textContent).toBe('1 of 3 nodes complete')
    expect(summary.style.fontSize).toBe('11.5px')
    expect(summary.style.color).toBe('rgb(207, 213, 218)')
    const elapsed = screen.getByTestId('run-progress-elapsed')
    expect(elapsed.textContent).toBe('1.3s')
    expect(elapsed.style.fontFamily).toContain('JetBrains Mono')
    expect(elapsed.style.color).toBe('rgb(93, 101, 108)')
  })

  it('draws the 3px determinate bar from progress, not from the node counts', () => {
    render(<RunRunningView state={state()} />)
    const track = screen.getByTestId('run-progress-bar')
    expect(track.style.height).toBe('3px')
    expect(track.style.background).toBe('rgb(22, 25, 28)')
    expect(track.style.overflow).toBe('hidden')
    const fill = screen.getByTestId('run-progress-fill')
    expect(fill.style.width).toBe('54%')
    expect(fill.getAttribute('style')).toContain('var(--accent, #1fd6bd)')
  })

  it('clamps a progress value outside the unit range', () => {
    render(<RunRunningView state={state({ progress: 1.4 })} />)
    expect(screen.getByTestId('run-progress-fill').style.width).toBe('100%')
    cleanup()
    render(<RunRunningView state={state({ progress: -0.2 })} />)
    expect(screen.getByTestId('run-progress-fill').style.width).toBe('0%')
  })

  it('renders the node rows with the accent-tinted active row', () => {
    render(<RunRunningView state={state()} />)
    expect(screen.getByTestId('run-node-rows')).toBeInTheDocument()
    expect(screen.getByTestId('run-node-row-render').getAttribute('style')).toContain(
      'rgba(31, 214, 189, 0.05)',
    )
  })

  it('draws the live log with mono timestamps and a pulsing caret on the pending line', () => {
    render(<RunRunningView state={state()} />)
    expect(screen.getByTestId('run-live-log-label').textContent).toBe('Live log')
    expect(screen.getByTestId('run-live-log-follow').textContent).toBe('follow')
    const time = screen.getByTestId('run-log-time-0')
    expect(time.textContent).toBe('0.00 ')
    expect(time.style.color).toBe('rgb(65, 71, 76)')
    const line = screen.getByTestId('run-log-line-3')
    expect(line.textContent).toContain('render rasterising frame 2/3')
    const pending = screen.getByTestId('run-log-pending')
    expect(pending.textContent).toContain('waiting for imageOut')
    expect(pending.style.color).toBe('rgb(93, 101, 108)')
    const caret = screen.getByTestId('run-log-caret')
    expect(caret.style.width).toBe('3px')
    expect(caret.style.height).toBe('9px')
    expect(caret.style.animation).toBe('jpulse 1s ease-in-out infinite')
  })

  it('omits the log block and its divider when no log is supplied', () => {
    render(<RunRunningView state={state({ log: undefined })} />)
    expect(screen.queryByTestId('run-live-log-label')).toBeNull()
    expect(screen.queryByTestId('run-panel-divider')).toBeNull()
  })

  it('draws the explanatory line and the shimmering partial output when asked', () => {
    const note =
      'Streaming output as each node settles. Inputs are locked for the duration of the run.'
    render(<RunRunningView state={state({ note, partialOutput: true })} />)
    expect(screen.getByTestId('run-panel-note').textContent).toBe(note)
    expect(screen.getByTestId('run-partial-output-label').textContent).toBe('Partial output')
    const media = screen.getByTestId('run-partial-media')
    expect(media.style.height).toBe('70px')
    expect(media.style.animation).toBe('jshim 1.5s linear infinite')
    expect(media.style.backgroundSize).toBe('220% 100%')
    const caption = screen.getByTestId('run-partial-caption')
    expect(caption.style.height).toBe('9px')
    expect(caption.style.width).toBe('70%')
  })

  it('omits the note and the partial output by default', () => {
    render(<RunRunningView state={state()} />)
    expect(screen.queryByTestId('run-panel-note')).toBeNull()
    expect(screen.queryByTestId('run-partial-output-label')).toBeNull()
  })

  it('closes with Cancel run, its esc hint, and its click', async () => {
    const onCancel = vi.fn()
    render(<RunRunningView state={state({ onCancel })} />)
    const button = screen.getByTestId('run-cancel-button')
    expect(button.style.height).toBe('34px')
    expect(button.style.fontWeight).toBe('500')
    expect(screen.getByText('esc')).toBeInTheDocument()
    await userEvent.click(button)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
