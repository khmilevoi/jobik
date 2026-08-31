import type { NodeInputDescriptor } from '@jobik/core'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import * as z from 'zod'
import type { RunPanelState } from '#run/types.js'
import { RunStateHeader } from './RunStateHeader.js'

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

describe('RunStateHeader', () => {
  it('spins beside Running and the run number while a run is in flight', () => {
    render(<RunStateHeader state={RUNNING} entryNodeId="start1" />)
    expect(screen.getByTestId('run-state-header-spinner')).toBeInTheDocument()
    expect(screen.getByTestId('run-state-header-title').textContent).toBe('Running')
    expect(screen.getByTestId('run-state-header-meta').textContent).toBe('#219')
  })

  it('names a failed run with its elapsed time', () => {
    render(<RunStateHeader state={FAILED} entryNodeId="start1" />)
    expect(screen.getByTestId('run-state-header-dot')).toBeInTheDocument()
    expect(screen.getByTestId('run-state-header-title').textContent).toBe('Run failed')
    expect(screen.getByTestId('run-state-header-meta').textContent).toBe('#220 · 0.8s')
  })

  /**
   * The four-state table is the whole of what separates a failed header from a settled one now
   * that its wash lives in `RunStateHeader.module.css`, so the branch itself is asserted here. The
   * three states the artboards draw alike must stay alike, and `failed` must not join them.
   */
  it('gives failed its own chrome and leaves the other three states sharing one', () => {
    render(<RunStateHeader state={IDLE} entryNodeId="start1" />)
    const idle = screen.getByTestId('run-state-header').className
    cleanup()
    render(<RunStateHeader state={RUNNING} entryNodeId="start1" />)
    const running = screen.getByTestId('run-state-header').className
    cleanup()
    render(<RunStateHeader state={COMPLETED} entryNodeId="start1" />)
    const completed = screen.getByTestId('run-state-header').className
    cleanup()
    render(<RunStateHeader state={FAILED} entryNodeId="start1" />)
    const failed = screen.getByTestId('run-state-header').className

    expect(new Set([idle, running, completed]).size).toBe(1)
    expect(failed).not.toBe(idle)
  })

  it('marks a completed run with the ok dot and its elapsed time', () => {
    render(<RunStateHeader state={COMPLETED} entryNodeId="start1" />)
    expect(screen.getByTestId('run-state-header-dot')).toBeInTheDocument()
    expect(screen.getByTestId('run-state-header-title').textContent).toBe('Completed')
    expect(screen.getByTestId('run-state-header-meta').textContent).toBe('#221 · 2.4s')
  })

  it('heads an idle card with Run and the entry id, and no run number', () => {
    render(<RunStateHeader state={IDLE} entryNodeId="start1" />)
    expect(screen.getByTestId('run-state-header-title').textContent).toBe('Run')
    expect(screen.getByTestId('run-state-header-entry').textContent).toBe('start1')
    expect(screen.queryByTestId('run-state-header-meta')).toBeNull()
  })

  it('draws no leading mark at all on the idle header', () => {
    render(<RunStateHeader state={IDLE} entryNodeId="start1" />)
    expect(screen.queryByTestId('run-state-header-dot')).toBeNull()
    expect(screen.queryByTestId('run-state-header-spinner')).toBeNull()
  })
})
