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

/**
 * No artboard draws a start selector — all eleven show `publication`, which declares one start. So
 * the chooser's whole contract is that a single-start flow is unchanged, and the multi-start case
 * borrows `3C`'s segmented control rather than inventing a shape.
 */
describe('RunIdleView — the start chooser', () => {
  it('draws nothing at all for a flow with one start', () => {
    render(<RunIdleView state={state({ startIds: ['start1'] })} />)
    expect(screen.queryByTestId('run-start-chooser')).toBeNull()
    expect(screen.queryByText('Start')).toBeNull()
  })

  it('draws nothing when the caller names no starts', () => {
    render(<RunIdleView state={state()} />)
    expect(screen.queryByTestId('run-start-chooser')).toBeNull()
  })

  it('offers every start once there is more than one, marking the selected one', () => {
    render(
      <RunIdleView state={state({ entryNodeId: 'byNumber', startIds: ['byName', 'byNumber'] })} />,
    )
    expect(screen.getByTestId('run-start-chooser')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'byName' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'byNumber' })).toBeChecked()
  })

  it('reports the chosen start', async () => {
    const onSelectStart = vi.fn()
    render(
      <RunIdleView
        state={state({ entryNodeId: 'byName', startIds: ['byName', 'byNumber'], onSelectStart })}
      />,
    )
    await userEvent.click(screen.getByRole('radio', { name: 'byNumber' }))
    expect(onSelectStart).toHaveBeenCalledWith('byNumber')
  })
})

/**
 * `3D`: *"Run is disabled while any error stands."* `3B` fixes the treatment — 45 % and nothing
 * else — and the docked control and the top-bar pill already did it. This one did not.
 */
describe('RunIdleView — blocked', () => {
  it('leaves the run button live by default', () => {
    render(<RunIdleView state={state()} />)
    expect(screen.getByTestId('run-start-button')).toBeEnabled()
  })

  it('dims the run button and refuses to start when an error stands', async () => {
    const onRun = vi.fn()
    render(<RunIdleView state={state({ blocked: true, onRun })} />)
    const button = screen.getByTestId('run-start-button')
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(onRun).not.toHaveBeenCalled()
  })
})
