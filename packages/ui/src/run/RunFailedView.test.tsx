import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RunFailedView } from './RunFailedView.js'
import type { RunFailedState } from './types.js'

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
  it('opens with the error well, tinted for the failed state', () => {
    render(<RunFailedView state={state()} />)
    const well = screen.getByTestId('run-error-well')
    expect(well.style.border).toBe('1px solid rgb(42, 31, 30)')
    expect(well.style.background).toBe('rgb(13, 11, 11)')
    expect(well.style.padding).toBe('11px')
  })

  it('names the tagged error, its owning node and its safe message', () => {
    render(<RunFailedView state={state()} />)
    const name = screen.getByTestId('run-error-name')
    expect(name.textContent).toBe('ImageRenderError')
    expect(name.style.fontFamily).toContain('JetBrains Mono')
    expect(name.style.fontSize).toBe('11px')
    expect(name.style.color).toBe('rgb(220, 133, 119)')
    const node = screen.getByTestId('run-error-node')
    expect(node.textContent).toBe('render')
    expect(node.style.fontSize).toBe('9.5px')
    expect(node.style.color).toBe('rgb(109, 95, 92)')
    const message = screen.getByTestId('run-error-message')
    expect(message.textContent).toBe(MESSAGE)
    expect(message.style.fontSize).toBe('11.5px')
    expect(message.style.color).toBe('rgb(167, 155, 152)')
    expect(message.style.lineHeight).toBe('1.55')
  })

  it('shows the node list with failed and skipped', () => {
    render(<RunFailedView state={state()} />)
    expect(screen.getByTestId('run-timing-value-render').textContent).toBe('failed')
    expect(screen.getByTestId('run-timing-value-publish').textContent).toBe('skipped')
    expect(screen.getByTestId('run-timing-value-start1').style.color).toBe('rgb(111, 156, 130)')
  })

  it('draws the trimmed stack ending in the hidden-frame count', () => {
    render(<RunFailedView state={state()} />)
    const block = screen.getByTestId('run-stack')
    expect(block.style.fontFamily).toContain('JetBrains Mono')
    expect(block.style.fontSize).toBe('10px')
    expect(block.style.lineHeight).toBe('1.6')
    expect(block.style.color).toBe('rgb(121, 130, 138)')
    expect(screen.getByTestId('run-stack-label').textContent).toBe('stack')
    expect(screen.getByTestId('run-stack-frame-0').textContent).toBe(
      'at imageOut.raster (imageOut.ts:184)',
    )
    expect(screen.getByTestId('run-stack-frame-1').textContent).toBe(
      'at render.invoke (flow.ts:41)',
    )
    const hidden = screen.getByTestId('run-stack-hidden')
    expect(hidden.textContent).toBe('↳ 6 frames hidden')
    expect(hidden.style.color).toBe('rgb(78, 85, 91)')
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

  it('closes with Copy log beside a solid Re-run, both reporting their clicks', async () => {
    const onCopyLog = vi.fn()
    const onRerun = vi.fn()
    render(<RunFailedView state={state({ onCopyLog, onRerun })} />)
    const copy = screen.getByTestId('run-copy-log')
    expect(copy.style.height).toBe('34px')
    expect(copy.style.fontWeight).toBe('400')
    const rerun = screen.getByTestId('run-rerun')
    expect(rerun.style.height).toBe('34px')
    expect(rerun.style.color).toBe('rgb(4, 33, 29)')
    expect(rerun.getAttribute('style')).toContain('var(--accent, #1fd6bd)')
    await userEvent.click(copy)
    await userEvent.click(rerun)
    expect(onCopyLog).toHaveBeenCalledTimes(1)
    expect(onRerun).toHaveBeenCalledTimes(1)
  })
})
