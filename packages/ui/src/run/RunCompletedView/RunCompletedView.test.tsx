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

  it('loads the resolved asset URL into the thumbnail, and shows the placeholder without one', () => {
    render(
      <RunCompletedView
        state={state({
          outputs: [
            {
              kind: 'asset',
              field: 'image',
              asset: { type: 'Buffer', mime: 'image/png', bytes: 421888, id: 'asset-1' },
              src: '/api/assets/asset-1',
            },
          ],
        })}
      />,
    )
    const image = screen.getByAltText('image')
    expect(image.getAttribute('src')).toBe('/api/assets/asset-1')

    cleanup()
    render(<RunCompletedView state={state()} />)
    expect(screen.queryByAltText('image')).toBeNull()
    expect(screen.getByTestId('run-output-thumb-image')).toBeInTheDocument()
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

  it('omits the section when no outputs are supplied at all', () => {
    render(<RunCompletedView state={state({ outputs: undefined })} />)
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
    outputs: [],
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
    expect(screen.getByTestId('run-outputs-label').textContent).toBe('Outputs')
  })

  /**
   * `2A` puts the outputs in the bottom dock; the states card keeps them here. Both must work, and
   * `07-copy.md` §8 states the one order a panel carrying both takes: outputs, then the primary.
   */
  it('keeps an Outputs section between the inputs and the primary when outputs are supplied', () => {
    render(<RunCompletedView state={state({ ...shape, outputs: state().outputs })} />)
    const label = screen.getByTestId('run-outputs-label')
    const rerun = screen.getByTestId('run-rerun-button')
    expect(screen.getByTestId('run-output-name-caption')).toBeInTheDocument()
    expect(screen.getByTestId('run-log-label')).toBeInTheDocument()
    // DOCUMENT_POSITION_FOLLOWING: the primary comes after the Outputs section, not before it.
    expect(label.compareDocumentPosition(rerun) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  /** The entry point is chosen from the sidebar and the canvas now, never from this panel. */
  it('draws no start selector', () => {
    render(<RunCompletedView state={state({ ...shape, entryNodeId: 'start1' })} />)
    expect(screen.queryByTestId('run-start-chooser')).toBeNull()
  })
})
