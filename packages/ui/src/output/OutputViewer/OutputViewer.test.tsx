import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OutputComponentProps } from '../flowUi.js'
import { OutputPreview } from '../OutputPreview/OutputPreview.js'
import { OutputViewer } from './OutputViewer.js'

afterEach(cleanup)

const output = {
  image: { type: 'Buffer', mime: 'image/png', bytes: 654336, id: 'a1' },
  caption: 'Release 0.4 — field…',
}

/** Stands in for a flow-local component; the publication example ships the real one. */
function ArtboardOutput(_props: OutputComponentProps) {
  return (
    <OutputPreview
      primary={{ label: 'cover.png', meta: ['1024×1024', 'png', '412 kb'], metaTrailing: 'sRGB' }}
      variants={[{ label: 'og.png', caption: '1200×630 · 208 kb' }]}
      emptyVariants={1}
      typedValues={[{ name: 'caption', value: 'Release 0.4' }]}
    />
  )
}

const descriptor = { nodes: { render: { Output: ArtboardOutput } } }

describe('OutputViewer', () => {
  it('marks the active tab selected and the others not', () => {
    render(<OutputViewer nodeId="render" output={output} />)
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Raw' })).toHaveAttribute('aria-selected', 'false')
  })

  it('reproduces the artboard Preview instance: source field and both actions', () => {
    render(
      <OutputViewer
        nodeId="render"
        output={output}
        descriptor={descriptor}
        source="render.image · Buffer[3]"
        onCopyAll={() => {}}
        onDownload={() => {}}
      />,
    )
    expect(screen.getByTestId('output-viewer-source')).toHaveTextContent('render.image · Buffer[3]')
    expect(screen.getByTestId('output-viewer-divider')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy all' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
    expect(screen.getByTestId('output-preview')).toBeInTheDocument()
  })

  it('reproduces the artboard Raw instance: no source, no actions, a size readout', () => {
    render(<OutputViewer nodeId="render" output={output} defaultTab="raw" source="render.image" />)
    expect(screen.queryByTestId('output-viewer-source')).toBeNull()
    expect(screen.queryByTestId('output-viewer-divider')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy all' })).toBeNull()
    expect(screen.getByTestId('output-viewer-meta')).toHaveTextContent(/^json · \d/)
    expect(screen.getAllByTestId('raw-json-gutter').length).toBeGreaterThan(0)
  })

  it('serialises the report it is given rather than the node output when both are present', () => {
    render(<OutputViewer nodeId="render" output={output} raw={{ run: 219 }} defaultTab="raw" />)
    expect(screen.getByTestId('output-viewer-panel')).toHaveTextContent('"run": 219')
    expect(screen.getByTestId('output-viewer-panel')).not.toHaveTextContent('caption')
  })

  it('shows the log lines and their count on the Logs tab', () => {
    render(
      <OutputViewer
        nodeId="render"
        output={output}
        defaultTab="logs"
        logs={[{ time: '0.31', message: 'render layout pass complete' }]}
      />,
    )
    expect(screen.getByTestId('output-logs')).toHaveTextContent('render layout pass complete')
    expect(screen.getByTestId('output-viewer-meta')).toHaveTextContent('1 line')
  })

  it('pluralises the log line count once there is more than one', () => {
    render(
      <OutputViewer
        nodeId="render"
        output={output}
        defaultTab="logs"
        logs={[
          { time: '0.31', message: 'render layout pass complete' },
          { time: '0.42', message: 'render encode pass complete' },
        ]}
      />,
    )
    expect(screen.getByTestId('output-viewer-meta')).toHaveTextContent('2 lines')
  })

  it('switches tabs on click and reports the change', async () => {
    const onTabChange = vi.fn()
    render(<OutputViewer nodeId="render" output={output} onTabChange={onTabChange} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Raw' }))
    expect(onTabChange).toHaveBeenCalledWith('raw')
    expect(screen.getByRole('tab', { name: 'Raw' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByTestId('raw-json-gutter').length).toBeGreaterThan(0)
  })

  it('falls back to the generic JSON viewer when the node has no registered renderer', () => {
    render(<OutputViewer nodeId="publish" output={output} descriptor={descriptor} />)
    expect(screen.getByTestId('generic-output')).toBeInTheDocument()
    expect(screen.queryByTestId('output-preview')).toBeNull()
  })

  it('mounts the registered component at viewer width with the node it belongs to', () => {
    const seen: OutputComponentProps[] = []
    function Spy(props: OutputComponentProps) {
      seen.push(props)
      return <div data-testid="spy" />
    }
    render(
      <OutputViewer
        nodeId="render"
        output={output}
        descriptor={{ nodes: { render: { Output: Spy } } }}
      />,
    )
    expect(screen.getByTestId('spy')).toBeInTheDocument()
    expect(seen[0].surface).toBe('viewer')
    expect(seen[0].nodeId).toBe('render')
    expect(seen[0].output).toBe(output)
    expect(
      seen[0].assetUrl({ type: 'Buffer', mime: 'image/png', bytes: 1, id: 'a1' }),
    ).toBeUndefined()
  })

  it('hands the caller`s asset resolver straight through', () => {
    const assetUrl = vi.fn(() => '/assets/a1')
    function Spy(props: OutputComponentProps) {
      return (
        <div data-testid="spy">
          {props.assetUrl({ type: 'Buffer', mime: 'image/png', bytes: 1, id: 'a1' })}
        </div>
      )
    }
    render(
      <OutputViewer
        nodeId="render"
        output={output}
        assetUrl={assetUrl}
        descriptor={{ nodes: { render: { Output: Spy } } }}
      />,
    )
    expect(screen.getByTestId('spy')).toHaveTextContent('/assets/a1')
  })
})
