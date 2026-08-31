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
    outputs: [
      {
        kind: 'asset',
        field: 'image',
        asset: { type: 'Buffer', mime: 'image/png', bytes: 421888, id: 'asset-1' },
        meta: 'png · 1024² · 412 kb',
      },
      { kind: 'text', field: 'caption', value: 'Release 0.4 — field-level connections' },
      { kind: 'url', field: 'url', value: 'cdn.jobik.dev/p/219/cover.png' },
    ],
    ...overrides,
  }
}

describe('RunCompletedView', () => {
  it('opens with the per-node timings', () => {
    render(<RunCompletedView state={state()} />)
    expect(screen.getByTestId('run-timing-value-render').textContent).toBe('2.1s')
  })

  it('divides the timings from the Outputs section', () => {
    render(<RunCompletedView state={state()} />)
    expect(screen.getByTestId('run-panel-divider')).toBeInTheDocument()
    expect(screen.getByTestId('run-outputs-label').textContent).toBe('Outputs')
  })

  it('draws a binary field as a thumbnail with its name, meta and Open action', () => {
    render(<RunCompletedView state={state()} />)
    expect(screen.getByTestId('run-output-thumb-image')).toBeInTheDocument()
    expect(screen.getByTestId('run-output-name-image').textContent).toBe('image')
    expect(screen.getByTestId('run-output-meta-image').textContent).toBe('png · 1024² · 412 kb')
    expect(screen.getByTestId('run-output-open-image')).toBeInTheDocument()
  })

  it('falls back to the descriptor when no meta line is supplied', () => {
    render(
      <RunCompletedView
        state={state({
          outputs: [
            {
              kind: 'asset',
              field: 'image',
              asset: { type: 'Buffer', mime: 'image/png', bytes: 421888, id: 'a' },
            },
          ],
        })}
      />,
    )
    expect(screen.getByTestId('run-output-meta-image').textContent).toBe('png · 412 kb')
  })

  it('reports the Open click', async () => {
    const onOpen = vi.fn()
    render(
      <RunCompletedView
        state={state({
          outputs: [
            {
              kind: 'asset',
              field: 'image',
              asset: { type: 'Buffer', mime: 'image/png', bytes: 421888, id: 'a' },
              onOpen,
            },
          ],
        })}
      />,
    )
    await userEvent.click(screen.getByTestId('run-output-open-image'))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('renders a supplied thumbnail instead of the striped placeholder', () => {
    render(
      <RunCompletedView
        state={state({
          outputs: [
            {
              kind: 'asset',
              field: 'image',
              asset: { type: 'Buffer', mime: 'image/png', bytes: 1, id: 'a' },
              thumbnail: <div data-testid="real-thumb" />,
            },
          ],
        })}
      />,
    )
    expect(screen.getByTestId('real-thumb')).toBeInTheDocument()
  })

  /**
   * The design draws a text output as a wrapped body and a url as one clipped accent mono line, so
   * the two wells are separate cells of the same table. Both now live in
   * `RunCompletedView.module.css`; what is asserted here is that the table still tells them apart.
   */
  it('draws a text field and a url field in their own wells under their names', () => {
    render(<RunCompletedView state={state()} />)
    expect(screen.getByTestId('run-output-name-caption').textContent).toBe('caption')
    const text = screen.getByTestId('run-output-well-caption')
    const url = screen.getByTestId('run-output-well-url')
    expect(text.textContent).toBe('Release 0.4 — field-level connections')
    expect(url.textContent).toBe('cdn.jobik.dev/p/219/cover.png')
    expect(text.className).not.toBe(url.className)
  })

  it('omits the divider and the section entirely when a run produced no outputs', () => {
    render(<RunCompletedView state={state({ outputs: [] })} />)
    expect(screen.queryByTestId('run-panel-divider')).toBeNull()
    expect(screen.queryByTestId('run-outputs-label')).toBeNull()
  })
})
