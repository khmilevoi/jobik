import type { NodeInputDescriptor } from '@jobik/core'
import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as z from 'zod'
import { RunStatusDot } from '#run/RunChrome/RunChrome.js'
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

  /** The entry point is chosen from the sidebar and the canvas now, never from this panel. */
  it('draws no start selector', () => {
    render(<RunIdleView state={state()} />)
    expect(screen.queryByTestId('run-start-chooser')).toBeNull()
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

  /**
   * R7's third arm reaches this block too: `_lastRun` reads the viewed report, and the panel falls
   * back to `idle` as soon as the settled run stops being the current one — cancel a run, pick a
   * different start, and this is what the user reads. It must not say the run they stopped failed.
   */
  it('prints `cancelled` for a run the user stopped, apart from both other outcomes', () => {
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
    const failedDot = screen.getByTestId('run-last-run-dot').className
    cleanup()
    render(
      <RunIdleView
        state={state({
          lastRun: {
            status: 'cancelled',
            totalElapsed: '0.9s',
            nodeCount: 3,
            timings: [{ nodeId: 'render', status: 'skipped' }],
          },
        })}
      />,
    )

    expect(screen.getByTestId('run-last-run-status').textContent).toBe('cancelled')
    const cancelledDot = screen.getByTestId('run-last-run-dot').className
    expect(cancelledDot).not.toBe(completedDot)
    expect(cancelledDot).not.toBe(failedDot)
    cleanup()

    // A missing entry in `lastRunDotTone` leaves `tone` undefined, which renders the same dot as
    // a caller that asked for no tone at all — so the three-way difference above would hold for a
    // state the table forgot. This is what says `cancelled` resolves to a tone of its own.
    render(<RunStatusDot shape="round" data-testid="untoned-dot" />)
    expect(cancelledDot).not.toBe(screen.getByTestId('untoned-dot').className)
  })

  it('omits the divider and the block entirely when there is no last run', () => {
    render(<RunIdleView state={state({ lastRun: undefined })} />)
    expect(screen.queryByTestId('run-panel-divider')).toBeNull()
    expect(screen.queryByTestId('run-last-run-label')).toBeNull()
  })
})

/**
 * F02: an invalid draft used to vanish. `onInvalid` was declared and fired, and nothing anywhere
 * supplied it — so a required field left empty produced no field error, no strip, no modal and no
 * request.
 *
 * The design draws NO surface for a rejected run input (see the doc comment on `RunIdleState.issues`),
 * so the panel borrows the one treatment it already has for a validation finding: the error well
 * the `Run panel — states` failed card draws, in the same tones.
 */
describe('RunIdleView — a rejected draft', () => {
  it('draws no error well while the caller reports nothing', () => {
    render(<RunIdleView state={state()} />)
    expect(screen.queryByTestId('run-input-issues')).toBeNull()
  })

  it('draws no error well for an empty issue list', () => {
    render(<RunIdleView state={state({ issues: [] })} />)
    expect(screen.queryByTestId('run-input-issues')).toBeNull()
  })

  it('names the field and prints the message for every issue the caller hands back', () => {
    render(
      <RunIdleView
        state={state({
          draft: { title: '', markdown: 'x' },
          issues: [
            { path: 'title', message: 'Too small: expected string to have >=1 characters' },
            { path: 'markdown', message: 'Invalid input' },
          ],
        })}
      />,
    )
    expect(screen.getByTestId('run-input-issues')).toBeInTheDocument()
    expect(screen.getByTestId('run-input-issue-title').textContent).toContain('title')
    expect(screen.getByTestId('run-input-issue-title').textContent).toContain(
      'Too small: expected string to have >=1 characters',
    )
    expect(screen.getByTestId('run-input-issue-markdown').textContent).toContain('Invalid input')
  })

  it('still prints an issue that names no field, such as a JSON syntax error', () => {
    render(
      <RunIdleView
        state={state({ issues: [{ path: '', message: 'meta: Unexpected token o' }] })}
      />,
    )
    expect(screen.getByTestId('run-input-issues').textContent).toContain('meta: Unexpected token o')
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
