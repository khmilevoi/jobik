import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RunNodeRows, RunNodeTimings } from './RunNodeList.js'
import type { RunNodeTiming } from './types.js'

afterEach(cleanup)

/** `Studio — run in progress`, lines 607–620. */
const RUNNING: readonly RunNodeTiming[] = [
  { nodeId: 'start1', status: 'ok', elapsed: '0.0s' },
  { nodeId: 'render', status: 'running', elapsed: '1.3s' },
  { nodeId: 'publish', status: 'queued' },
]

/** `Run panel — states` failed, lines 809–813. */
const FAILED: readonly RunNodeTiming[] = [
  { nodeId: 'start1', status: 'ok', elapsed: '0.0s' },
  { nodeId: 'render', status: 'failed' },
  { nodeId: 'publish', status: 'skipped' },
]

/** `Run panel — states` completed, lines 837–841. */
const COMPLETED: readonly RunNodeTiming[] = [
  { nodeId: 'start1', status: 'ok', elapsed: '0.0s' },
  { nodeId: 'render', status: 'ok', elapsed: '2.1s' },
  { nodeId: 'publish', status: 'ok', elapsed: '0.3s' },
]

describe('RunNodeRows', () => {
  it('draws 30px rows two pixels apart', () => {
    render(<RunNodeRows nodes={RUNNING} />)
    expect(screen.getByTestId('run-node-rows').style.gap).toBe('2px')
    const row = screen.getByTestId('run-node-row-start1')
    expect(row.style.height).toBe('30px')
    expect(row.style.padding).toBe('0px 8px')
    expect(row.style.borderRadius).toBe('5px')
  })

  it('gives a settled ok node a filled dot, a field-label name and a muted elapsed', () => {
    render(<RunNodeRows nodes={RUNNING} />)
    expect(screen.getByTestId('run-node-dot-start1').style.background).toBe('rgb(111, 156, 130)')
    const name = screen.getByTestId('run-node-name-start1')
    expect(name.style.fontSize).toBe('11.5px')
    expect(name.style.fontFamily).toContain('JetBrains Mono')
    expect(name.style.color).toBe('rgb(170, 177, 183)')
    const value = screen.getByTestId('run-node-value-start1')
    expect(value.textContent).toBe('0.0s')
    expect(value.style.fontSize).toBe('10px')
    expect(value.style.color).toBe('rgb(78, 85, 91)')
  })

  it('tints the running row with the accent wash, a spinner and an accent elapsed', () => {
    render(<RunNodeRows nodes={RUNNING} />)
    const row = screen.getByTestId('run-node-row-render')
    expect(row.getAttribute('style')).toContain('rgba(31, 214, 189, 0.05)')
    expect(row.getAttribute('style')).toContain('rgba(31, 214, 189, 0.18)')
    expect(screen.getByTestId('run-node-spinner-render')).toBeInTheDocument()
    expect(screen.getByTestId('run-node-name-render').style.color).toBe('rgb(223, 227, 230)')
    expect(screen.getByTestId('run-node-value-render').getAttribute('style')).toContain(
      'var(--accent, #1fd6bd)',
    )
  })

  it('gives a queued node a hollow dot, a dimmed name and the status word', () => {
    render(<RunNodeRows nodes={RUNNING} />)
    expect(screen.getByTestId('run-node-dot-publish').style.border).toBe(
      '1px solid rgb(52, 57, 61)',
    )
    expect(screen.getByTestId('run-node-name-publish').style.color).toBe('rgb(109, 117, 124)')
    const value = screen.getByTestId('run-node-value-publish')
    expect(value.textContent).toBe('queued')
    expect(value.style.color).toBe('rgb(65, 71, 76)')
  })

  it('carries the failed and skipped tones the compact list fixes', () => {
    render(<RunNodeRows nodes={FAILED} />)
    expect(screen.getByTestId('run-node-name-render').style.color).toBe('rgb(220, 133, 119)')
    expect(screen.getByTestId('run-node-value-render').style.color).toBe('rgb(201, 106, 92)')
    expect(screen.getByTestId('run-node-name-publish').style.color).toBe('rgb(109, 117, 124)')
    expect(screen.getByTestId('run-node-value-publish').textContent).toBe('skipped')
  })
})

describe('RunNodeTimings', () => {
  it('draws the failed card list at 10.5px with an ok-green elapsed', () => {
    render(<RunNodeTimings nodes={FAILED} variant="failed" />)
    const list = screen.getByTestId('run-timings')
    expect(list.style.gap).toBe('6px')
    expect(list.style.fontSize).toBe('10.5px')
    expect(list.style.fontFamily).toContain('JetBrains Mono')
    expect(screen.getByTestId('run-timing-name-start1').style.color).toBe('rgb(170, 177, 183)')
    expect(screen.getByTestId('run-timing-value-start1').style.color).toBe('rgb(111, 156, 130)')
    expect(screen.getByTestId('run-timing-name-render').style.color).toBe('rgb(220, 133, 119)')
    expect(screen.getByTestId('run-timing-value-render').textContent).toBe('failed')
    expect(screen.getByTestId('run-timing-value-publish').textContent).toBe('skipped')
  })

  it('draws the completed card list with a section-label elapsed instead', () => {
    render(<RunNodeTimings nodes={COMPLETED} variant="completed" />)
    expect(screen.getByTestId('run-timings').style.fontSize).toBe('10.5px')
    expect(screen.getByTestId('run-timing-name-render').style.color).toBe('rgb(170, 177, 183)')
    expect(screen.getByTestId('run-timing-value-render').style.color).toBe('rgb(78, 85, 91)')
  })

  it('draws the Last run list at 10px with the dimmer node name', () => {
    render(<RunNodeTimings nodes={COMPLETED} variant="lastRun" />)
    expect(screen.getByTestId('run-timings').style.fontSize).toBe('10px')
    expect(screen.getByTestId('run-timing-name-render').style.color).toBe('rgb(99, 108, 115)')
    expect(screen.getByTestId('run-timing-value-render').style.color).toBe('rgb(78, 85, 91)')
  })
})
