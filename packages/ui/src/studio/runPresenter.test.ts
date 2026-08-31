import { describe, expect, it } from 'vitest'
import type { RunStreamEvent, WireRunReportPayload } from '#client/index.js'
import {
  toNodeOverlays,
  toRunErrorDetail,
  toRunLog,
  toRunNodeTimings,
  toRunStack,
  toRunSummary,
} from './runPresenter.js'
import { applyRunEvent, createRunSession } from './runSession.js'

const ORDER = ['start1', 'render', 'publish']

function reduce(events: readonly RunStreamEvent[]) {
  return events.reduce(
    applyRunEvent,
    createRunSession({ startId: 'start1', nodeIds: ORDER, startedAt: 1000 }),
  )
}

describe('toRunNodeTimings', () => {
  it('keeps the descriptor order and formats settled elapsed times', () => {
    const session = reduce([
      { type: 'node-status', nodeId: 'start1', status: 'ok', elapsedMs: 10, error: null },
      { type: 'node-status', nodeId: 'render', status: 'running', elapsedMs: 0, error: null },
    ])

    expect(toRunNodeTimings(session, ORDER)).toEqual([
      { nodeId: 'start1', status: 'ok', elapsed: '0.0s' },
      { nodeId: 'render', status: 'running' },
      { nodeId: 'publish', status: 'queued' },
    ])
  })

  it('passes skipped through to the panel, which has a treatment for it', () => {
    const session = reduce([
      { type: 'node-status', nodeId: 'publish', status: 'skipped', elapsedMs: 0, error: null },
    ])

    expect(toRunNodeTimings(session, ORDER)[2]).toEqual({ nodeId: 'publish', status: 'skipped' })
  })
})

describe('toRunLog', () => {
  it('stamps each line as an offset from the run start', () => {
    const session = reduce([
      { type: 'node-log', line: { nodeId: 'render', message: 'layout pass', at: 1310 } },
    ])

    expect(toRunLog(session).lines).toEqual([{ time: '0.31', text: 'render layout pass' }])
  })

  it('carries the follow label the artboard reads', () => {
    expect(toRunLog(reduce([])).followLabel).toBe('follow')
  })
})

describe('toRunSummary', () => {
  it('reports a completed run', () => {
    const report: WireRunReportPayload = {
      flowName: 'publication',
      startId: 'start1',
      runNumber: 219,
      status: 'ok',
      elapsedMs: 2400,
      nodes: [
        { nodeId: 'render', status: 'ok', elapsedMs: 2100, output: {}, assets: {}, error: null },
      ],
      logs: [],
      error: null,
    }

    expect(toRunSummary(report)).toEqual({
      status: 'completed',
      totalElapsed: '2.4s',
      nodeCount: 1,
      timings: [{ nodeId: 'render', status: 'ok', elapsed: '2.1s' }],
    })
  })

  it('reports a cancelled run as failed, because the panel has only two tones', () => {
    const report: WireRunReportPayload = {
      flowName: 'publication',
      startId: 'start1',
      runNumber: 220,
      status: 'cancelled',
      elapsedMs: 900,
      nodes: [],
      logs: [],
      error: { _tag: 'RunCancelledError', message: 'The run was cancelled', runNumber: 220 },
    }

    expect(toRunSummary(report).status).toBe('failed')
  })
})

describe('toRunErrorDetail', () => {
  it('renders the tag and message the server sent for a returned tagged error', () => {
    const session = reduce([
      {
        type: 'node-status',
        nodeId: 'render',
        status: 'failed',
        elapsedMs: 800,
        error: {
          _tag: 'ImageRenderError',
          message: 'Unsupported colour profile in the inlined asset.',
          authored: true,
        },
      },
    ])

    expect(toRunErrorDetail(session)).toEqual({
      name: 'ImageRenderError',
      nodeId: 'render',
      message: 'Unsupported colour profile in the inlined asset.',
    })
  })

  it('renders an untagged failure exactly as it arrived, without inventing a name', () => {
    const session = reduce([
      { type: 'run-failed', error: { _tag: null, message: 'Internal server error' } },
    ])

    expect(toRunErrorDetail(session)).toEqual({
      name: 'Error',
      nodeId: '',
      message: 'Internal server error',
    })
  })
})

describe('toRunStack', () => {
  it('turns the wire frames into the panel stack, hidden count included', () => {
    expect(
      toRunStack({
        _tag: 'NodeExecutionError',
        message: 'Node render failed',
        frames: [{ fn: 'imageOut', file: 'nodes/imageOut.ts', line: 21 }],
        hiddenFrames: 12,
      }),
    ).toEqual({
      frames: [{ fn: 'imageOut', file: 'nodes/imageOut.ts', line: 21 }],
      hiddenFrames: 12,
    })
  })

  it('is undefined when the server sent no frames', () => {
    expect(toRunStack({ _tag: 'FlowSaveError', message: 'x' })).toBeUndefined()
  })
})

describe('toNodeOverlays', () => {
  it('gives a running node the running state, a progress bar and pending outputs', () => {
    const session = reduce([
      { type: 'node-status', nodeId: 'render', status: 'running', elapsedMs: 0, error: null },
    ])
    const overlay = toNodeOverlays(session).get('render')

    expect(overlay?.state).toBe('running')
    expect(overlay?.status).toBe('running')
    expect(overlay?.inputAnnotation).toBe('received')
    expect(overlay?.outputAnnotation).toBe('pending')
    expect(overlay?.progress).toBeGreaterThan(0)
  })

  it('gives a queued node the queued state and waiting inputs', () => {
    const overlay = toNodeOverlays(reduce([])).get('render')

    expect(overlay?.state).toBe('queued')
    expect(overlay?.inputAnnotation).toBe('waiting')
  })

  it('renders skipped with the queued chrome and the word skipped', () => {
    const session = reduce([
      { type: 'node-status', nodeId: 'publish', status: 'skipped', elapsedMs: 0, error: null },
    ])
    const overlay = toNodeOverlays(session).get('publish')

    expect(overlay?.state).toBe('queued')
    expect(overlay?.status).toBe('skipped')
  })

  it('gives an ok node its status dot and elapsed time', () => {
    const session = reduce([
      { type: 'node-status', nodeId: 'render', status: 'ok', elapsedMs: 2100, error: null },
    ])
    const overlay = toNodeOverlays(session).get('render')

    expect(overlay?.state).toBe('ok')
    expect(overlay?.status).toBe('ok')
    expect(overlay?.elapsed).toBe('2.1s')
  })

  it('gives a failed node the error well the Node states artboard fixes', () => {
    const session = reduce([
      {
        type: 'node-status',
        nodeId: 'render',
        status: 'failed',
        elapsedMs: 800,
        error: { _tag: 'ImageRenderError', message: 'Unsupported colour profile', authored: true },
      },
    ])
    const overlay = toNodeOverlays(session).get('render')

    expect(overlay?.state).toBe('failed')
    expect(overlay?.detail).toEqual({
      kind: 'failed',
      errorName: 'ImageRenderError',
      message: 'Unsupported colour profile',
    })
  })
})

/**
 * Closeout finding 3: `cached` used to narrow to `ok` on the way into the panel, so a reused result
 * would have been reported as a freshly computed one. It is unreachable in v1 by design — this is
 * the guard that keeps a future caching feature from arriving invisible.
 */
describe('a cached node reaches the panel as cached', () => {
  it('keeps the status in the node list rather than reporting ok', () => {
    const session = reduce([
      { type: 'node-status', nodeId: 'render', status: 'cached', elapsedMs: 0, error: null },
    ])

    expect(toRunNodeTimings(session, ORDER)[1]).toEqual({
      nodeId: 'render',
      status: 'cached',
      elapsed: '0.0s',
    })
  })

  it('keeps it in the Last run summary too', () => {
    const report = {
      flowName: 'publication',
      startId: 'start1',
      runNumber: 221,
      status: 'ok',
      elapsedMs: 2400,
      nodes: [
        { nodeId: 'render', status: 'cached', elapsedMs: 0, output: {}, assets: {}, error: null },
      ],
      logs: [],
      error: null,
    } as unknown as WireRunReportPayload

    expect(toRunSummary(report).timings[0]?.status).toBe('cached')
  })

  it('still paints the canvas card with the cached treatment', () => {
    const session = reduce([
      { type: 'node-status', nodeId: 'render', status: 'cached', elapsedMs: 0, error: null },
    ])

    expect(toNodeOverlays(session).get('render')).toMatchObject({
      state: 'cached',
      status: 'cached',
      elapsed: '0.0s',
    })
  })
})
