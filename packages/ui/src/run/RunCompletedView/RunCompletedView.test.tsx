import type { NodeInputDescriptor } from '@jobik/core'
import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RunCompletedState } from '#run/types.js'
import { RunCompletedView } from './RunCompletedView.js'

afterEach(cleanup)

/** `Run panel — states` completed, lines 829–866. */
function state(overrides: Partial<RunCompletedState> = {}): RunCompletedState {
  return {
    kind: 'completed',
    runNumber: 221,
    elapsed: '2.4s',
    nodes: [
      { nodeId: 'start1', status: 'ok', elapsed: '0.0s' },
      { nodeId: 'render', status: 'ok', elapsed: '2.1s' },
      { nodeId: 'publish', status: 'ok', elapsed: '0.3s' },
    ],
    ...overrides,
  }
}

describe('RunCompletedView', () => {
  it('opens with the per-node timings', () => {
    render(<RunCompletedView state={state()} />)
    expect(screen.getByTestId('run-timing-value-render').textContent).toBe('2.1s')
  })

  /**
   * There is no `Outputs` section any more (R8, retired) — a run's output lives only in the bottom
   * `OutputDock`, which now opens itself once a run settles successfully. This panel draws nothing
   * between the timings and the primary except the still-editable inputs.
   */
  it('draws no Outputs section, however the state is shaped', () => {
    render(<RunCompletedView state={state()} />)
    expect(screen.queryByTestId('run-panel-divider')).toBeNull()
    expect(screen.queryByTestId('run-outputs-label')).toBeNull()
  })
})

/**
 * `2A` — the newest artboard, and the one that shows the completed panel inside a live shell.
 * Timings, the inputs still editable, `Re-run start1 ⌘↵`, a divider, then `Log` / `tail`.
 */
describe('RunCompletedView, in 2A’s shape', () => {
  const descriptor: NodeInputDescriptor = {
    nodeId: 'start1',
    fields: [
      { field: 'title', required: true, annotation: 'string', control: { kind: 'string' } },
      { field: 'markdown', required: true, annotation: 'string', control: { kind: 'string' } },
    ],
  }

  const shape: Partial<RunCompletedState> = {
    entryNodeId: 'start1',
    inputs: {
      descriptor,
      draft: { title: 'Typed flows, quietly', markdown: '## Release 0.4' },
      presentation: { markdown: 'area' },
    },
    log: {
      followLabel: 'tail',
      lines: [
        { time: '0.00', text: 'start1 → emit title, markdown' },
        { time: '2.41', text: 'publish → url' },
      ],
    },
  }

  it('re-shows the inputs above the primary', () => {
    render(<RunCompletedView state={state(shape)} />)
    expect(screen.getByTestId('run-input-title')).toHaveValue('Typed flows, quietly')
    expect(screen.getByTestId('run-input-markdown')).toHaveValue('## Release 0.4')
    expect(screen.getByTestId('run-input-annotation-title').textContent).toBe('string')
  })

  /**
   * `2A:1207` — a 1px rule sits between the per-node timings block (`:1201-1205`) and the first
   * input group (`:1209`). It was the one divider of the three the view never drew.
   */
  it('divides the timings from the first input', () => {
    render(<RunCompletedView state={state(shape)} />)
    const divider = screen.getByTestId('run-inputs-divider')
    const timing = screen.getByTestId('run-timing-value-publish')
    const input = screen.getByTestId('run-input-title')
    expect(timing.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(divider.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  /** No inputs below it, nothing to divide — the artboard's rule separates two blocks, not one. */
  it('draws no such divider when the panel re-shows no inputs', () => {
    render(<RunCompletedView state={state({ ...shape, inputs: undefined })} />)
    expect(screen.queryByTestId('run-inputs-divider')).toBeNull()
  })

  it('keeps the re-shown inputs editable, reporting each edit to the caller', async () => {
    const onDraftChange = vi.fn()
    render(
      <RunCompletedView
        state={state({
          ...shape,
          inputs: { descriptor, draft: { title: 'a', markdown: '' }, onDraftChange },
        })}
      />,
    )
    await userEvent.type(screen.getByTestId('run-input-title'), 'b')
    expect(onDraftChange).toHaveBeenCalledWith('title', 'ab')
  })

  it('labels the primary Re-run <start> and reports its click', async () => {
    const onRerun = vi.fn()
    render(<RunCompletedView state={state({ ...shape, onRerun })} />)
    const button = screen.getByTestId('run-rerun-button')
    expect(button.textContent).toContain('Re-run start1')
    expect(screen.getByText('⌘↵')).toBeInTheDocument()
    await userEvent.click(button)
    expect(onRerun).toHaveBeenCalledTimes(1)
  })

  it('closes with the Log block behind its own divider', () => {
    render(<RunCompletedView state={state(shape)} />)
    expect(screen.getByTestId('run-log-divider')).toBeInTheDocument()
    expect(screen.getByTestId('run-log-label').textContent).toBe('Log')
    expect(screen.getByTestId('run-log-follow').textContent).toBe('tail')
    expect(screen.getByTestId('run-log-line-1').textContent).toContain('publish → url')
  })

  it('draws none of it when the caller supplies none of it, so the unwired panel is unchanged', () => {
    render(<RunCompletedView state={state()} />)
    expect(screen.queryByTestId('run-input-title')).toBeNull()
    expect(screen.queryByTestId('run-rerun-button')).toBeNull()
    expect(screen.queryByTestId('run-log-label')).toBeNull()
    expect(screen.queryByTestId('run-log-divider')).toBeNull()
    expect(screen.queryByTestId('run-outputs-label')).toBeNull()
  })

  /** The entry point is chosen from the sidebar and the canvas now, never from this panel. */
  it('draws no start selector', () => {
    render(<RunCompletedView state={state({ ...shape, entryNodeId: 'start1' })} />)
    expect(screen.queryByTestId('run-start-chooser')).toBeNull()
  })
})
