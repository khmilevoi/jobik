import type { NodeInputDescriptor } from '@jobik/core'
import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as z from 'zod'
import type { RunIdleState } from '#run/types.js'
import { RunIdleView } from './RunIdleView.js'

afterEach(cleanup)

/** `Studio — default`, lines 275–312. */
const NOTE =
  'Inputs are typed from the flow declaration. Only downstream nodes of the selected entry point run.'

const descriptor: NodeInputDescriptor = {
  nodeId: 'start1',
  fields: [
    { field: 'title', required: true, annotation: 'string', control: { kind: 'string' } },
    { field: 'markdown', required: true, annotation: 'string', control: { kind: 'string' } },
  ],
}

const input = z.object({ title: z.string().min(1), markdown: z.string().min(1) })

function state(overrides: Partial<RunIdleState> = {}): RunIdleState {
  return {
    kind: 'idle',
    entryNodeId: 'start1',
    note: NOTE,
    descriptor,
    input,
    draft: { title: 'Typed flows, quietly', markdown: '## Release 0.4' },
    presentation: { markdown: 'area' },
    lastRun: {
      status: 'completed',
      totalElapsed: '2.4s',
      nodeCount: 3,
      timings: [
        { nodeId: 'start1', status: 'ok', elapsed: '0.0s' },
        { nodeId: 'render', status: 'ok', elapsed: '2.1s' },
        { nodeId: 'publish', status: 'ok', elapsed: '0.3s' },
      ],
    },
    ...overrides,
  }
}

describe('RunIdleView', () => {
  it('opens with the explanatory line', () => {
    render(<RunIdleView state={state()} />)
    expect(screen.getByTestId('run-panel-note').textContent).toBe(NOTE)
  })

  it('renders one control per input field, honouring the caller presentation', () => {
    render(<RunIdleView state={state()} />)
    expect(screen.getByTestId('run-input-title').tagName).toBe('INPUT')
    expect(screen.getByTestId('run-input-markdown').tagName).toBe('TEXTAREA')
  })

  it('carries the run button with its shortcut', () => {
    render(<RunIdleView state={state()} />)
    expect(screen.getByRole('button', { name: /Run start1/ })).toBeInTheDocument()
    expect(screen.getByText('⌘↵')).toBeInTheDocument()
  })

  it('fires onRun with the parsed values when the draft satisfies the schema', async () => {
    const onRun = vi.fn()
    const onInvalid = vi.fn()
    render(<RunIdleView state={state({ onRun, onInvalid })} />)
    await userEvent.click(screen.getByRole('button', { name: /Run start1/ }))
    expect(onRun).toHaveBeenCalledWith({
      title: 'Typed flows, quietly',
      markdown: '## Release 0.4',
    })
    expect(onInvalid).not.toHaveBeenCalled()
  })

  it('fires onInvalid and never onRun when it does not', async () => {
    const onRun = vi.fn()
    const onInvalid = vi.fn()
    render(<RunIdleView state={state({ draft: { title: '', markdown: 'x' }, onRun, onInvalid })} />)
    await userEvent.click(screen.getByRole('button', { name: /Run start1/ }))
    expect(onRun).not.toHaveBeenCalled()
    expect(onInvalid.mock.calls[0]?.[0]).toBeInstanceOf(Error)
  })

  it('reports each keystroke through onDraftChange', async () => {
    const onDraftChange = vi.fn()
    render(<RunIdleView state={state({ draft: { title: '', markdown: '' }, onDraftChange })} />)
    await userEvent.type(screen.getByTestId('run-input-title'), 'T')
    expect(onDraftChange).toHaveBeenCalledWith('title', 'T')
  })

  it('closes with a divider and the Last run block', () => {
    render(<RunIdleView state={state()} />)
    expect(screen.getByTestId('run-panel-divider')).toBeInTheDocument()
    expect(screen.getByTestId('run-last-run-label').textContent).toBe('Last run')
    expect(screen.getByTestId('run-last-run-dot')).toBeInTheDocument()
    expect(screen.getByTestId('run-last-run-status').textContent).toBe('completed')
    expect(screen.getByTestId('run-last-run-meta').textContent).toBe('2.4s · 3 nodes')
    expect(screen.getByTestId('run-timing-value-render').textContent).toBe('2.1s')
  })

  it('marks a failed last run apart from a completed one', () => {
    render(<RunIdleView state={state()} />)
    const completedDot = screen.getByTestId('run-last-run-dot').className
    cleanup()
    render(
      <RunIdleView
        state={state({
          lastRun: {
            status: 'failed',
            totalElapsed: '0.8s',
            nodeCount: 3,
            timings: [{ nodeId: 'render', status: 'failed' }],
          },
        })}
      />,
    )
    expect(screen.getByTestId('run-last-run-status').textContent).toBe('failed')
    expect(screen.getByTestId('run-last-run-dot').className).not.toBe(completedDot)
  })

  it('omits the divider and the block entirely when there is no last run', () => {
    render(<RunIdleView state={state({ lastRun: undefined })} />)
    expect(screen.queryByTestId('run-panel-divider')).toBeNull()
    expect(screen.queryByTestId('run-last-run-label')).toBeNull()
  })
})
