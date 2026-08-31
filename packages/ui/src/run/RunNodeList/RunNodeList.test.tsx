import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { RunNodeTiming } from '../types.js'
import { RunNodeRows, RunNodeTimings, resolveRunNodeTone } from './RunNodeList.js'

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
  it('draws one row per node, in the order it was given them', () => {
    render(<RunNodeRows nodes={RUNNING} />)
    const rows = [...screen.getByTestId('run-node-rows').children]
    expect(rows.map((row) => row.getAttribute('data-testid'))).toEqual([
      'run-node-row-start1',
      'run-node-row-render',
      'run-node-row-publish',
    ])
  })

  it('gives a settled ok node a dot and its elapsed time', () => {
    render(<RunNodeRows nodes={RUNNING} />)
    expect(screen.getByTestId('run-node-dot-start1')).toBeInTheDocument()
    expect(screen.getByTestId('run-node-name-start1').textContent).toBe('start1')
    expect(screen.getByTestId('run-node-value-start1').textContent).toBe('0.0s')
  })

  it('leads the running row with a spinner and sets it apart from the settled rows', () => {
    render(<RunNodeRows nodes={RUNNING} />)
    expect(screen.getByTestId('run-node-spinner-render')).toBeInTheDocument()
    expect(screen.queryByTestId('run-node-dot-render')).toBeNull()
    expect(screen.getByTestId('run-node-row-render').className).not.toBe(
      screen.getByTestId('run-node-row-start1').className,
    )
    expect(screen.getByTestId('run-node-value-render').textContent).toBe('1.3s')
  })

  it('gives a queued node a dot and the status word in place of an elapsed time', () => {
    render(<RunNodeRows nodes={RUNNING} />)
    expect(screen.getByTestId('run-node-dot-publish')).toBeInTheDocument()
    expect(screen.getByTestId('run-node-value-publish').textContent).toBe('queued')
  })

  it('carries the failed and skipped rows the compact list fixes', () => {
    render(<RunNodeRows nodes={FAILED} />)
    expect(screen.getByTestId('run-node-value-render').textContent).toBe('failed')
    expect(screen.getByTestId('run-node-value-publish').textContent).toBe('skipped')
    expect(screen.getByTestId('run-node-name-render').className).not.toBe(
      screen.getByTestId('run-node-name-publish').className,
    )
  })
})

describe('RunNodeTimings', () => {
  it('draws the failed card list with its statuses in place of elapsed times', () => {
    render(<RunNodeTimings nodes={FAILED} variant="failed" />)
    expect(screen.getByTestId('run-timing-value-start1').textContent).toBe('0.0s')
    expect(screen.getByTestId('run-timing-value-render').textContent).toBe('failed')
    expect(screen.getByTestId('run-timing-value-publish').textContent).toBe('skipped')
  })

  /**
   * The three lists differ only in the type step and in the two cells a settled `ok` node paints —
   * green on the failed card, the section-label step on the completed one, a dimmer name in the
   * idle `Last run` block. All three now live in the stylesheet, so what is asserted is that the
   * variant table still tells them apart.
   */
  it('paints a settled ok node differently in each of the three variants', () => {
    render(<RunNodeTimings nodes={COMPLETED} variant="failed" />)
    const onFailed = resolveRunNodeTone('ok', 'failed')
    const onCompleted = resolveRunNodeTone('ok', 'completed')
    const onLastRun = resolveRunNodeTone('ok', 'lastRun')
    expect(onFailed.value).not.toBe(onCompleted.value)
    expect(onLastRun.name).not.toBe(onCompleted.name)
    expect(screen.getByTestId('run-timings')).toBeInTheDocument()
  })

  it('sizes the last-run list apart from the two card lists', () => {
    render(<RunNodeTimings nodes={COMPLETED} variant="completed" />)
    const completed = screen.getByTestId('run-timings').className
    cleanup()
    render(<RunNodeTimings nodes={COMPLETED} variant="lastRun" />)
    expect(screen.getByTestId('run-timings').className).not.toBe(completed)
  })
})

/**
 * Closeout finding 3. No run-panel artboard fixes a cached row, so the row borrows exactly two
 * things from the `Node states` cached card — its `#4a5157` dot (design 747) and its
 * `cached · 0.0s` label (750) — and nothing else changes.
 *
 * Both marks survive the move to CSS Modules, and both are asserted here. The label is text and is
 * checked as text; the dot's colour now lives in `RunChrome.module.css`, so what is checked is that
 * a cached node still resolves to a different dot class from an ok one — if the resolver ever
 * collapsed the two, that is the assertion that fails. The timings list draws no dot at all, which
 * is exactly why the label has to carry the distinction on its own there.
 */
describe('a cached node in the run panel', () => {
  const CACHED: readonly RunNodeTiming[] = [
    { nodeId: 'start1', status: 'ok', elapsed: '0.0s' },
    { nodeId: 'render', status: 'cached', elapsed: '0.0s' },
  ]

  it('resolves to a different dot and a different value tone from an ok node', () => {
    const cached = resolveRunNodeTone('cached', 'rows')
    const ok = resolveRunNodeTone('ok', 'rows')
    expect(cached.dot).not.toEqual(ok.dot)
    expect(cached.value).not.toBe(ok.value)
  })

  it('never reads as a freshly computed ok in the 30px rows', () => {
    render(<RunNodeRows nodes={CACHED} />)
    expect(screen.getByTestId('run-node-value-render').textContent).toBe('cached · 0.0s')
    expect(screen.getByTestId('run-node-value-start1').textContent).toBe('0.0s')
    expect(screen.getByTestId('run-node-dot-render').className).not.toBe(
      screen.getByTestId('run-node-dot-start1').className,
    )
  })

  it('says so in the timings list too, which draws no dot at all', () => {
    render(<RunNodeTimings nodes={CACHED} variant="completed" />)
    expect(screen.getByTestId('run-timing-value-render').textContent).toBe('cached · 0.0s')
    expect(screen.getByTestId('run-timing-value-start1').textContent).toBe('0.0s')
    expect(screen.getByTestId('run-timing-value-render').className).not.toBe(
      screen.getByTestId('run-timing-value-start1').className,
    )
  })
})
