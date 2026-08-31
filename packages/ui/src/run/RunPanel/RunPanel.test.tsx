import type { NodeInputDescriptor } from '@jobik/core'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import * as z from 'zod'
import type { RunPanelState } from '#run/types.js'
import { RunDock } from '#shell/index.js'
import { RunPanel, RunPanelCard } from './RunPanel.js'

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

describe('RunPanelCard', () => {
  it('draws the card of the states artboard, header and body', () => {
    render(<RunPanelCard state={RUNNING} entryNodeId="start1" />)
    expect(screen.getByTestId('run-panel-card')).toBeInTheDocument()
    expect(screen.getByTestId('run-panel-card-body')).toBeInTheDocument()
    expect(screen.getByTestId('run-state-header')).toBeInTheDocument()
    expect(screen.getByTestId('run-progress-bar')).toBeInTheDocument()
  })

  /** The card artboard's running body is the bar and the compact timings, not the docked rows. */
  it('draws the running state as the card artboard, not as the dock', () => {
    render(<RunPanelCard state={RUNNING} entryNodeId="start1" />)
    expect(screen.queryByTestId('run-node-rows')).toBeNull()
    expect(screen.queryByTestId('run-progress-summary')).toBeNull()
    expect(screen.getByTestId('run-timing-name-render').textContent).toBe('render')
  })

  /** The error tint is the failed card's only mark, and it is now a class. Hold the branch. */
  it('frames a failed card differently from a settled one', () => {
    render(<RunPanelCard state={COMPLETED} entryNodeId="start1" />)
    const settled = screen.getByTestId('run-panel-card').className
    cleanup()
    render(<RunPanelCard state={FAILED} entryNodeId="start1" />)
    expect(screen.getByTestId('run-panel-card').className).not.toBe(settled)
  })
})
