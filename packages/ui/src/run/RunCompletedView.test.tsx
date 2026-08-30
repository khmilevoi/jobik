import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RunCompletedView } from './RunCompletedView.js'
import type { RunCompletedState } from './types.js'

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
  it('opens with the per-node timings in the settled tone', () => {
    render(<RunCompletedView state={state()} />)
    expect(screen.getByTestId('run-timing-value-render').textContent).toBe('2.1s')
    expect(screen.getByTestId('run-timing-value-render').style.color).toBe('rgb(78, 85, 91)')
  })

  it('divides the timings from the Outputs section', () => {
    render(<RunCompletedView state={state()} />)
    expect(screen.getByTestId('run-panel-divider')).toBeInTheDocument()
    const label = screen.getByTestId('run-outputs-label')
    expect(label.textContent).toBe('Outputs')
    expect(label.style.fontSize).toBe('9.5px')
    expect(label.style.textTransform).toBe('uppercase')
  })

  it('draws a binary field as a 54px thumbnail with its name, meta and Open action', () => {
    render(<RunCompletedView state={state()} />)
    const thumb = screen.getByTestId('run-output-thumb-image')
    expect(thumb.style.width).toBe('54px')
    expect(thumb.style.height).toBe('54px')
    const name = screen.getByTestId('run-output-name-image')
    expect(name.textContent).toBe('image')
    expect(name.style.fontSize).toBe('11px')
    expect(name.style.color).toBe('rgb(223, 227, 230)')
    const meta = screen.getByTestId('run-output-meta-image')
    expect(meta.textContent).toBe('png · 1024² · 412 kb')
    expect(meta.style.fontSize).toBe('9.5px')
    expect(meta.style.color).toBe('rgb(93, 101, 108)')
    const open = screen.getByTestId('run-output-open-image')
    expect(open.style.height).toBe('24px')
    expect(open.style.color).toBe('rgb(174, 181, 187)')
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

  it('draws a text field as an inset well under its name', () => {
    render(<RunCompletedView state={state()} />)
    const name = screen.getByTestId('run-output-name-caption')
    expect(name.style.color).toBe('rgb(195, 201, 206)')
    const well = screen.getByTestId('run-output-well-caption')
    expect(well.style.border).toBe('1px solid rgb(28, 31, 34)')
    expect(well.style.padding).toBe('8px 10px')
    expect(well.style.fontSize).toBe('11.5px')
    expect(well.style.color).toBe('rgb(170, 177, 183)')
    expect(well.textContent).toBe('Release 0.4 — field-level connections')
  })

  it('draws a url field in accent mono on one clipped line', () => {
    render(<RunCompletedView state={state()} />)
    const well = screen.getByTestId('run-output-well-url')
    expect(well.style.fontFamily).toContain('JetBrains Mono')
    expect(well.style.fontSize).toBe('10.5px')
    expect(well.getAttribute('style')).toContain('var(--accent, #1fd6bd)')
    expect(well.style.whiteSpace).toBe('nowrap')
    expect(well.style.textOverflow).toBe('ellipsis')
    expect(well.style.overflow).toBe('hidden')
  })

  it('omits the divider and the section entirely when a run produced no outputs', () => {
    render(<RunCompletedView state={state({ outputs: [] })} />)
    expect(screen.queryByTestId('run-panel-divider')).toBeNull()
    expect(screen.queryByTestId('run-outputs-label')).toBeNull()
  })
})
