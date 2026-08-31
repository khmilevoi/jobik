import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RunFailedState } from '#run/types.js'
import { RunFailedView } from './RunFailedView.js'

afterEach(cleanup)

/** `Run panel — states` failed, lines 794–828. */
const MESSAGE =
  'Unsupported colour profile in the inlined asset. The node produced no output, so downstream nodes were skipped.'

function state(overrides: Partial<RunFailedState> = {}): RunFailedState {
  return {
    kind: 'failed',
    runNumber: 220,
    elapsed: '0.8s',
    error: { name: 'ImageRenderError', nodeId: 'render', message: MESSAGE },
    nodes: [
      { nodeId: 'start1', status: 'ok', elapsed: '0.0s' },
      { nodeId: 'render', status: 'failed' },
      { nodeId: 'publish', status: 'skipped' },
    ],
    stack: {
      frames: [
        { fn: 'imageOut.raster', file: 'imageOut.ts', line: 184 },
        { fn: 'render.invoke', file: 'flow.ts', line: 41 },
      ],
      hiddenFrames: 6,
    },
    ...overrides,
  }
}

describe('RunFailedView', () => {
  it('opens with the error well', () => {
    render(<RunFailedView state={state()} />)
    expect(screen.getByTestId('run-error-well')).toBeInTheDocument()
  })

  it('names the tagged error, its owning node and its safe message', () => {
    render(<RunFailedView state={state()} />)
    expect(screen.getByTestId('run-error-name').textContent).toBe('ImageRenderError')
    expect(screen.getByTestId('run-error-node').textContent).toBe('render')
    expect(screen.getByTestId('run-error-message').textContent).toBe(MESSAGE)
  })

  it('shows the node list with failed and skipped', () => {
    render(<RunFailedView state={state()} />)
    expect(screen.getByTestId('run-timing-value-render').textContent).toBe('failed')
    expect(screen.getByTestId('run-timing-value-publish').textContent).toBe('skipped')
    expect(screen.getByTestId('run-timing-value-start1').textContent).toBe('0.0s')
  })

  it('draws the trimmed stack ending in the hidden-frame count', () => {
    render(<RunFailedView state={state()} />)
    expect(screen.getByTestId('run-stack')).toBeInTheDocument()
    expect(screen.getByTestId('run-stack-label').textContent).toBe('stack')
    expect(screen.getByTestId('run-stack-frame-0').textContent).toBe(
      'at imageOut.raster (imageOut.ts:184)',
    )
    expect(screen.getByTestId('run-stack-frame-1').textContent).toBe(
      'at render.invoke (flow.ts:41)',
    )
    expect(screen.getByTestId('run-stack-hidden').textContent).toBe('↳ 6 frames hidden')
  })

  it('omits the hidden-frame line when nothing was trimmed', () => {
    render(
      <RunFailedView
        state={state({
          stack: { frames: [{ fn: 'a.b', file: 'a.ts', line: 1 }], hiddenFrames: 0 },
        })}
      />,
    )
    expect(screen.queryByTestId('run-stack-hidden')).toBeNull()
  })

  it('omits the whole stack block when no stack was sent', () => {
    render(<RunFailedView state={state({ stack: undefined })} />)
    expect(screen.queryByTestId('run-stack')).toBeNull()
  })

  it('closes with Copy log beside Re-run, both reporting their clicks', async () => {
    const onCopyLog = vi.fn()
    const onRerun = vi.fn()
    render(<RunFailedView state={state({ onCopyLog, onRerun })} />)
    const copy = screen.getByTestId('run-copy-log')
    const rerun = screen.getByTestId('run-rerun')
    await userEvent.click(copy)
    await userEvent.click(rerun)
    expect(onCopyLog).toHaveBeenCalledTimes(1)
    expect(onRerun).toHaveBeenCalledTimes(1)
  })
})
