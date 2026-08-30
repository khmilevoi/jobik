import type { NodeInputDescriptor } from '@jobik/core'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import * as z from 'zod'
import { RunDock } from '../shell/index.js'
import { RunPanel, RunPanelCard, RunStateHeader } from './RunPanel.js'
import type { RunPanelState } from './types.js'

afterEach(cleanup)

const descriptor: NodeInputDescriptor = {
  nodeId: 'start1',
  fields: [{ field: 'title', required: true, annotation: 'string', control: { kind: 'string' } }],
}

const IDLE: RunPanelState = {
  kind: 'idle',
  entryNodeId: 'start1',
  note: 'Inputs are typed from the flow declaration.',
  descriptor,
  input: z.object({ title: z.string() }),
  draft: { title: 'Typed flows, quietly' },
}

const RUNNING: RunPanelState = {
  kind: 'running',
  runNumber: 219,
  elapsed: '1.3s',
  completedNodes: 1,
  totalNodes: 3,
  progress: 0.54,
  nodes: [{ nodeId: 'render', status: 'running', elapsed: '1.3s' }],
}

const FAILED: RunPanelState = {
  kind: 'failed',
  runNumber: 220,
  elapsed: '0.8s',
  error: { name: 'ImageRenderError', nodeId: 'render', message: 'Unsupported colour profile.' },
  nodes: [{ nodeId: 'render', status: 'failed' }],
}

const COMPLETED: RunPanelState = {
  kind: 'completed',
  runNumber: 221,
  elapsed: '2.4s',
  nodes: [{ nodeId: 'render', status: 'ok', elapsed: '2.1s' }],
  outputs: [{ kind: 'text', field: 'caption', value: 'Release 0.4' }],
}

describe('RunPanel', () => {
  it('renders the idle form', () => {
    render(<RunPanel state={IDLE} />)
    expect(screen.getByTestId('run-input-title')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Run start1/ })).toBeInTheDocument()
  })

  it('renders the running progress and rows', () => {
    render(<RunPanel state={RUNNING} />)
    expect(screen.getByTestId('run-progress-summary').textContent).toBe('1 of 3 nodes complete')
    expect(screen.getByTestId('run-node-rows')).toBeInTheDocument()
  })

  it('renders the failed error well', () => {
    render(<RunPanel state={FAILED} />)
    expect(screen.getByTestId('run-error-name').textContent).toBe('ImageRenderError')
  })

  it('renders the completed outputs', () => {
    render(<RunPanel state={COMPLETED} />)
    expect(screen.getByTestId('run-outputs-label').textContent).toBe('Outputs')
  })

  it('adds no wrapper of its own, so the dock body keeps supplying the padding and gap', () => {
    render(
      <RunDock entryNodeId="start1" onCollapse={() => {}}>
        <RunPanel state={IDLE} />
      </RunDock>,
    )
    const body = screen.getByTestId('studio-dock-body')
    expect(body.style.padding).toBe('16px 14px')
    expect(body.style.gap).toBe('16px')
    // The note is a DIRECT child of the dock body: no fragment wrapper sits between them.
    expect(screen.getByTestId('run-panel-note').parentElement).toBe(body)
  })

  it('draws exactly one panel header when it fills the dock', () => {
    render(
      <RunDock entryNodeId="start1" onCollapse={() => {}}>
        <RunPanel state={FAILED} />
      </RunDock>,
    )
    expect(screen.queryByTestId('run-state-header')).toBeNull()
  })
})

describe('RunStateHeader', () => {
  it('spins beside Running and the run number while a run is in flight', () => {
    render(<RunStateHeader state={RUNNING} entryNodeId="start1" />)
    expect(screen.getByTestId('run-state-header-spinner')).toBeInTheDocument()
    expect(screen.getByTestId('run-state-header-title').textContent).toBe('Running')
    expect(screen.getByTestId('run-state-header-meta').textContent).toBe('#219')
    expect(screen.getByTestId('run-state-header-meta').style.color).toBe('rgb(93, 101, 108)')
  })

  it('tints the failed header and names the run with its elapsed time', () => {
    render(<RunStateHeader state={FAILED} entryNodeId="start1" />)
    const header = screen.getByTestId('run-state-header')
    expect(header.getAttribute('style')).toContain('rgba(201, 106, 92, 0.05)')
    expect(header.style.borderBottom).toBe('1px solid rgb(36, 27, 26)')
    expect(screen.getByTestId('run-state-header-dot').style.background).toBe('rgb(201, 106, 92)')
    expect(screen.getByTestId('run-state-header-title').textContent).toBe('Run failed')
    expect(screen.getByTestId('run-state-header-title').style.color).toBe('rgb(240, 230, 228)')
    expect(screen.getByTestId('run-state-header-meta').textContent).toBe('#220 · 0.8s')
    expect(screen.getByTestId('run-state-header-meta').style.color).toBe('rgb(109, 95, 92)')
  })

  it('marks a completed run with the ok dot and its elapsed time', () => {
    render(<RunStateHeader state={COMPLETED} entryNodeId="start1" />)
    expect(screen.getByTestId('run-state-header-dot').style.background).toBe('rgb(111, 156, 130)')
    expect(screen.getByTestId('run-state-header-title').textContent).toBe('Completed')
    expect(screen.getByTestId('run-state-header-meta').textContent).toBe('#221 · 2.4s')
  })

  it('heads an idle card with Run and the entry id in accent mono', () => {
    render(<RunStateHeader state={IDLE} entryNodeId="start1" />)
    expect(screen.getByTestId('run-state-header-title').textContent).toBe('Run')
    const entry = screen.getByTestId('run-state-header-entry')
    expect(entry.textContent).toBe('start1')
    expect(entry.getAttribute('style')).toContain('var(--accent, #1fd6bd)')
    expect(screen.queryByTestId('run-state-header-meta')).toBeNull()
  })
})

describe('RunPanelCard', () => {
  it('draws the 320x430 card of the states artboard, header and body', () => {
    render(<RunPanelCard state={RUNNING} entryNodeId="start1" />)
    const card = screen.getByTestId('run-panel-card')
    expect(card.style.width).toBe('320px')
    expect(card.style.height).toBe('430px')
    expect(card.style.borderRadius).toBe('8px')
    expect(card.style.border).toBe('1px solid rgb(26, 29, 32)')
    expect(card.style.background).toBe('rgb(10, 11, 13)')
    const body = screen.getByTestId('run-panel-card-body')
    expect(body.style.padding).toBe('16px 14px')
    expect(body.style.gap).toBe('14px')
    expect(screen.getByTestId('run-state-header')).toBeInTheDocument()
    expect(screen.getByTestId('run-progress-bar')).toBeInTheDocument()
  })

  it('frames a failed card in the error tint', () => {
    render(<RunPanelCard state={FAILED} entryNodeId="start1" />)
    expect(screen.getByTestId('run-panel-card').style.border).toBe('1px solid rgb(36, 27, 26)')
  })
})
