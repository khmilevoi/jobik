import { describe, expect, it } from 'vitest'
import type { RunStreamEvent, WireRunReportPayload } from '#client/index.js'
import {
  applyRunEvent,
  completedNodeCount,
  createRunSession,
  markCancelFailed,
  markCancelling,
} from './runSession.js'

const NODE_IDS = ['start1', 'render', 'publish']

function session() {
  return createRunSession({ startId: 'start1', nodeIds: NODE_IDS, startedAt: 1000 })
}

function reduce(events: readonly RunStreamEvent[]) {
  return events.reduce(applyRunEvent, session())
}

const REPORT: WireRunReportPayload = {
  flowName: 'publication',
  startId: 'start1',
  runNumber: 219,
  status: 'ok',
  elapsedMs: 2400,
  nodes: [
    {
      nodeId: 'start1',
      status: 'ok',
      elapsedMs: 10,
      output: { title: 't' },
      assets: {},
      error: null,
    },
    {
      nodeId: 'render',
      status: 'ok',
      elapsedMs: 2100,
      output: { caption: 'c' },
      assets: { image: { type: 'Buffer', mime: 'image/png', bytes: 412_000, id: 'asset-1' } },
      error: null,
    },
    {
      nodeId: 'publish',
      status: 'ok',
      elapsedMs: 290,
      output: { url: 'https://x' },
      assets: {},
      error: null,
    },
  ],
  logs: [{ nodeId: 'render', message: 'layout pass complete', at: 1310 }],
  error: null,
}

describe('createRunSession', () => {
  it('seeds every reachable node as queued', () => {
    const created = session()

    expect([...created.nodes.keys()]).toEqual(NODE_IDS)
    expect(created.nodes.get('render')).toEqual({ status: 'queued', elapsedMs: 0, error: null })
    expect(created.runNumber).toBeUndefined()
    expect(created.runToken).toBeUndefined()
    expect(created.report).toBeUndefined()
    expect(created.failure).toBeUndefined()
  })
})

describe('applyRunEvent', () => {
  it('records the run token from the first line', () => {
    const next = applyRunEvent(session(), { type: 'run-accepted', runToken: 'tok-1' })

    expect(next.runToken).toBe('tok-1')
  })

  it('records the run number and node count when the run starts', () => {
    const next = reduce([
      { type: 'run-accepted', runToken: 'tok-1' },
      {
        type: 'run-started',
        runNumber: 219,
        flowName: 'publication',
        startId: 'start1',
        nodeCount: 3,
      },
    ])

    expect(next.runNumber).toBe(219)
    expect(next.nodeCount).toBe(3)
  })

  it('applies a node status transition with its elapsed time', () => {
    const next = applyRunEvent(session(), {
      type: 'node-status',
      nodeId: 'render',
      status: 'running',
      elapsedMs: 0,
      error: null,
    })

    expect(next.nodes.get('render')).toEqual({ status: 'running', elapsedMs: 0, error: null })
  })

  it('keeps the error a failed node transition carries', () => {
    const next = applyRunEvent(session(), {
      type: 'node-status',
      nodeId: 'render',
      status: 'failed',
      elapsedMs: 800,
      error: { _tag: 'ImageRenderError', message: 'Unsupported colour profile', authored: true },
    })

    expect(next.nodes.get('render')?.error).toEqual({
      _tag: 'ImageRenderError',
      message: 'Unsupported colour profile',
      authored: true,
    })
  })

  it('records a node the descriptor never named', () => {
    const next = applyRunEvent(session(), {
      type: 'node-status',
      nodeId: 'ghost',
      status: 'ok',
      elapsedMs: 4,
      error: null,
    })

    expect(next.nodes.get('ghost')).toEqual({ status: 'ok', elapsedMs: 4, error: null })
  })

  it('appends log lines in arrival order', () => {
    const next = reduce([
      { type: 'node-log', line: { nodeId: 'render', message: 'first', at: 1100 } },
      { type: 'node-log', line: { nodeId: 'render', message: 'second', at: 1200 } },
    ])

    expect(next.logs.map((line) => line.message)).toEqual(['first', 'second'])
  })

  it('settles with the final report and adopts its node statuses', () => {
    const next = applyRunEvent(session(), { type: 'run-settled', report: REPORT })

    expect(next.report).toBe(REPORT)
    expect(next.runNumber).toBe(219)
    expect(next.nodes.get('publish')).toEqual({ status: 'ok', elapsedMs: 290, error: null })
    expect(next.logs).toEqual(REPORT.logs)
  })

  it('does not mutate the previous session or its node map when the run settles', () => {
    const before = session()
    const beforeNodes = before.nodes

    const after = applyRunEvent(before, { type: 'run-settled', report: REPORT })

    expect(after).not.toBe(before)
    expect(after.nodes).not.toBe(beforeNodes)
    expect(before.nodes).toBe(beforeNodes)
    expect([...before.nodes.values()]).toEqual([
      { status: 'queued', elapsedMs: 0, error: null },
      { status: 'queued', elapsedMs: 0, error: null },
      { status: 'queued', elapsedMs: 0, error: null },
    ])
  })

  it('settles on run-failed with the error the server sent, untouched', () => {
    const next = applyRunEvent(session(), {
      type: 'run-failed',
      error: { _tag: null, message: 'Internal server error' },
    })

    expect(next.failure).toEqual({ _tag: null, message: 'Internal server error' })
    expect(next.report).toBeUndefined()
  })

  it('settles on run-failed even when no node ever started, leaving every node queued', () => {
    const next = applyRunEvent(session(), {
      type: 'run-failed',
      error: { _tag: 'RunInputError', message: 'missing field "title"', authored: true },
    })

    expect(next.failure).toEqual({
      _tag: 'RunInputError',
      message: 'missing field "title"',
      authored: true,
    })
    expect([...next.nodes.values()]).toEqual([
      { status: 'queued', elapsedMs: 0, error: null },
      { status: 'queued', elapsedMs: 0, error: null },
      { status: 'queued', elapsedMs: 0, error: null },
    ])
    expect(next.logs).toEqual([])
  })

  it('takes a node straight from queued to failed with no running transition', () => {
    const next = applyRunEvent(session(), {
      type: 'node-status',
      nodeId: 'publish',
      status: 'failed',
      elapsedMs: 12,
      error: { _tag: 'PublishError', message: 'endpoint unreachable', authored: true },
    })

    expect(next.nodes.get('publish')).toEqual({
      status: 'failed',
      elapsedMs: 12,
      error: { _tag: 'PublishError', message: 'endpoint unreachable', authored: true },
    })
    // Untouched siblings stay exactly as seeded.
    expect(next.nodes.get('start1')).toEqual({ status: 'queued', elapsedMs: 0, error: null })
    expect(next.nodes.get('render')).toEqual({ status: 'queued', elapsedMs: 0, error: null })
  })

  it('records a log line for a node that has not reported a status yet', () => {
    const next = applyRunEvent(session(), {
      type: 'node-log',
      line: { nodeId: 'publish', message: 'preparing upload', at: 1050 },
    })

    // The log lands even though `publish` is still seeded `queued` — logs and statuses are
    // independent streams the reducer never cross-validates.
    expect(next.logs).toEqual([{ nodeId: 'publish', message: 'preparing upload', at: 1050 }])
    expect(next.nodes.get('publish')).toEqual({ status: 'queued', elapsedMs: 0, error: null })
  })

  it('lets the settled report overrule a status the stream disagreed with', () => {
    // Rule under test: `run-settled` is the authority. A node the stream reported `failed`
    // is overwritten by the report if the report says otherwise (e.g. a retry inside the
    // handler resolved before the run settled) — the streamed transitions only let the panel
    // move before the report lands, they are never merged with it.
    const disagreeingReport: WireRunReportPayload = {
      ...REPORT,
      nodes: REPORT.nodes.map((node) =>
        node.nodeId === 'render'
          ? { ...node, status: 'ok' as const, elapsedMs: 2100, error: null }
          : node,
      ),
    }

    const next = reduce([
      {
        type: 'node-status',
        nodeId: 'render',
        status: 'failed',
        elapsedMs: 500,
        error: { _tag: 'ImageRenderError', message: 'transient', authored: true },
      },
      { type: 'run-settled', report: disagreeingReport },
    ])

    expect(next.nodes.get('render')).toEqual({ status: 'ok', elapsedMs: 2100, error: null })
  })

  it('does not mutate the previous session or its node map when a node transitions', () => {
    const before = session()
    const beforeNodes = before.nodes
    const beforeRenderRecord = before.nodes.get('render')

    const after = applyRunEvent(before, {
      type: 'node-status',
      nodeId: 'render',
      status: 'running',
      elapsedMs: 0,
      error: null,
    })

    expect(after).not.toBe(before)
    expect(after.nodes).not.toBe(beforeNodes)
    expect(before.nodes).toBe(beforeNodes)
    expect(before.nodes.get('render')).toBe(beforeRenderRecord)
    expect(before.nodes.get('render')).toEqual({ status: 'queued', elapsedMs: 0, error: null })
  })

  it('does not mutate the previous logs array when a log line arrives', () => {
    const before = session()
    const beforeLogs = before.logs

    const after = applyRunEvent(before, {
      type: 'node-log',
      line: { nodeId: 'render', message: 'first', at: 1100 },
    })

    expect(after.logs).not.toBe(beforeLogs)
    expect(before.logs).toBe(beforeLogs)
    expect(before.logs).toEqual([])
  })

  it('reduces a whole realistic stream — accepted, started, transitions, interleaved logs, settled', () => {
    const events: readonly RunStreamEvent[] = [
      { type: 'run-accepted', runToken: 'tok-77' },
      {
        type: 'run-started',
        runNumber: 12,
        flowName: 'publication',
        startId: 'start1',
        nodeCount: 3,
      },
      { type: 'node-status', nodeId: 'start1', status: 'running', elapsedMs: 0, error: null },
      { type: 'node-status', nodeId: 'start1', status: 'ok', elapsedMs: 10, error: null },
      { type: 'node-status', nodeId: 'render', status: 'running', elapsedMs: 0, error: null },
      { type: 'node-log', line: { nodeId: 'render', message: 'start layout', at: 1050 } },
      { type: 'node-log', line: { nodeId: 'render', message: 'layout pass complete', at: 1310 } },
      { type: 'node-status', nodeId: 'render', status: 'ok', elapsedMs: 2100, error: null },
      { type: 'node-status', nodeId: 'publish', status: 'running', elapsedMs: 0, error: null },
      { type: 'node-log', line: { nodeId: 'publish', message: 'uploading', at: 3400 } },
      { type: 'node-status', nodeId: 'publish', status: 'ok', elapsedMs: 290, error: null },
      { type: 'run-settled', report: REPORT },
    ]

    const final = reduce(events)

    // The full resulting value, not one field: `run-settled` is the authority, so the
    // interim transitions above are superseded by `REPORT`'s nodes and logs.
    expect(final).toEqual({
      nodeReports: new Map(),
      startId: 'start1',
      runToken: 'tok-77',
      runNumber: 219,
      nodeCount: 3,
      startedAt: 1000,
      nodes: new Map([
        ['start1', { status: 'ok', elapsedMs: 10, error: null }],
        ['render', { status: 'ok', elapsedMs: 2100, error: null }],
        ['publish', { status: 'ok', elapsedMs: 290, error: null }],
      ]),
      logs: REPORT.logs,
      report: REPORT,
      failure: undefined,
      cancelling: false,
    })
    expect(completedNodeCount(final)).toBe(3)
  })

  it('reduces a stream that is cancelled mid-run and then settles as failed', () => {
    const cancelled = reduce([
      { type: 'run-accepted', runToken: 'tok-9' },
      {
        type: 'run-started',
        runNumber: 4,
        flowName: 'publication',
        startId: 'start1',
        nodeCount: 3,
      },
      { type: 'node-status', nodeId: 'start1', status: 'ok', elapsedMs: 10, error: null },
    ])
    const withCancel = markCancelling(cancelled)

    expect(withCancel.cancelling).toBe(true)
    expect(withCancel.report).toBeUndefined()
    expect(withCancel.failure).toBeUndefined()
    // `markCancelling` does not touch anything it did not seed itself.
    expect(withCancel.nodes).toBe(cancelled.nodes)
    expect(withCancel.runToken).toBe('tok-9')

    const settled = applyRunEvent(withCancel, {
      type: 'run-failed',
      error: { _tag: 'RunCancelledError', message: 'run cancelled', authored: true },
    })

    expect(settled.cancelling).toBe(true)
    expect(settled.report).toBeUndefined()
    expect(settled.failure).toEqual({
      _tag: 'RunCancelledError',
      message: 'run cancelled',
      authored: true,
    })
  })

  // 8-B's invariant, applied in the direction `markCancelFailed` cannot reach: the cancel request
  // failed while the run was still live, so `failure` was legitimately set (R27) — and then the
  // run produced its own report anyway. The run's outcome is the authority over the outcome of a
  // control action issued against it, and the panel renders `failure` *instead of* the report, so
  // carrying the stale request failure past the terminal line would paint a completed run as an
  // error and take its outputs off the panel. Only a cancel failure can ever be here to drop:
  // `run-settled` and `run-failed` are mutually exclusive, and nothing else in this reducer writes
  // `failure`.
  it('drops a failed cancel request when the run settles with its own report', () => {
    const live = markCancelling(applyRunEvent(session(), { type: 'run-accepted', runToken: 'tok' }))
    const cancelFailed = markCancelFailed(live, { _tag: null, message: 'Not found' })
    expect(cancelFailed.failure).toEqual({ _tag: null, message: 'Not found' })

    const settled = applyRunEvent(cancelFailed, { type: 'run-settled', report: REPORT })

    expect(settled.report).toEqual(REPORT)
    expect(settled.failure).toBeUndefined()
  })
})

describe('markCancelling', () => {
  it('flags the session without settling it', () => {
    const next = markCancelling(session())

    expect(next.cancelling).toBe(true)
    expect(next.report).toBeUndefined()
    expect(next.failure).toBeUndefined()
  })

  it('does not mutate the previous session', () => {
    const before = session()

    const after = markCancelling(before)

    expect(after).not.toBe(before)
    expect(before.cancelling).toBe(false)
  })

  // 8-B's invariant, on the click rather than the answer: a run that has already produced its
  // terminal line has nothing left to cancel, so the click cannot flag it either.
  it('leaves a settled session alone', () => {
    const settled = applyRunEvent(session(), { type: 'run-settled', report: REPORT })

    expect(markCancelling(settled)).toBe(settled)
  })
})

// Deferred finding 8-B. The panel renders `failure` in place of the report, so writing a failed
// cancel onto a session that has already settled is what made a completed run's outputs vanish
// behind `Error / Not found`. The rule is about the settled session, not about the status code:
// while the run is live the failure is real and still lands.
describe('markCancelFailed', () => {
  const NOT_FOUND = { _tag: null, message: 'Not found' } as const

  it('fails a live session — the cancel did not happen and the user must see it', () => {
    const live = applyRunEvent(session(), { type: 'run-accepted', runToken: 'tok-1' })

    const next = markCancelFailed(live, NOT_FOUND)

    expect(next.failure).toEqual(NOT_FOUND)
  })

  it('leaves a completed run report untouched', () => {
    const settled = applyRunEvent(session(), { type: 'run-settled', report: REPORT })

    const next = markCancelFailed(settled, NOT_FOUND)

    expect(next).toBe(settled)
    expect(next.report).toEqual(REPORT)
    expect(next.failure).toBeUndefined()
  })

  it("leaves a failed run's own error untouched", () => {
    const failed = applyRunEvent(session(), {
      type: 'run-failed',
      error: { _tag: 'ImageRenderError', message: 'Unsupported colour profile CMYK' },
    })

    const next = markCancelFailed(failed, NOT_FOUND)

    expect(next).toBe(failed)
    expect(next.failure).toEqual({
      _tag: 'ImageRenderError',
      message: 'Unsupported colour profile CMYK',
    })
  })

  // A cancel that was accepted and settled the run as cancelled is settled like any other: the
  // report the server sent back is the outcome, not a later failed retry of the same cancel.
  it('leaves a cancelled run report untouched', () => {
    const cancelled = applyRunEvent(markCancelling(session()), {
      type: 'run-settled',
      report: { ...REPORT, status: 'cancelled' },
    })

    expect(markCancelFailed(cancelled, NOT_FOUND)).toBe(cancelled)
  })
})

describe('completedNodeCount', () => {
  it('counts every node that has settled, however it settled', () => {
    const next = reduce([
      { type: 'node-status', nodeId: 'start1', status: 'ok', elapsedMs: 10, error: null },
      { type: 'node-status', nodeId: 'render', status: 'failed', elapsedMs: 800, error: null },
      { type: 'node-status', nodeId: 'publish', status: 'skipped', elapsedMs: 0, error: null },
    ])

    expect(completedNodeCount(next)).toBe(3)
  })

  it('does not count a queued or running node', () => {
    const next = applyRunEvent(session(), {
      type: 'node-status',
      nodeId: 'render',
      status: 'running',
      elapsedMs: 0,
      error: null,
    })

    expect(completedNodeCount(next)).toBe(0)
  })

  it('counts a fresh session as zero — every node is still queued', () => {
    expect(completedNodeCount(session())).toBe(0)
  })
})

it('retains current-run partial output, rejects other runs and replaces it with final authority', () => {
  const started = applyRunEvent(session(), {
    type: 'run-started',
    runNumber: 219,
    flowName: 'publication',
    startId: 'start1',
    nodeCount: 3,
  })
  const node = REPORT.nodes[1]
  const partial = applyRunEvent(started, { type: 'node-settled', runNumber: 219, node })
  expect(partial.nodeReports?.get('render')).toEqual(node)
  expect(partial.report).toBeUndefined()
  expect(partial.nodes.get('publish')?.status).toBe('queued')
  expect(applyRunEvent(partial, { type: 'node-settled', runNumber: 218, node })).toBe(partial)
  const final = applyRunEvent(partial, { type: 'run-settled', report: REPORT })
  expect(final.nodeReports?.size).toBe(0)
  expect(applyRunEvent(final, { type: 'node-settled', runNumber: 219, node })).toBe(final)
  expect(session().nodeReports?.size).toBe(0)
})

it('keeps completed output on stream failure but ignores late output after terminal failure', () => {
  const started = applyRunEvent(session(), {
    type: 'run-started',
    runNumber: 219,
    flowName: 'publication',
    startId: 'start1',
    nodeCount: 3,
  })
  const node = REPORT.nodes[1]
  const partial = applyRunEvent(started, { type: 'node-settled', runNumber: 219, node })
  const failed = applyRunEvent(partial, {
    type: 'run-failed',
    error: { _tag: null, message: 'Disconnected' },
  })
  expect(failed.nodeReports?.get('render')).toEqual(node)
  expect(
    applyRunEvent(failed, { type: 'node-settled', runNumber: 219, node: REPORT.nodes[2] }),
  ).toBe(failed)
  const cancelled = applyRunEvent(partial, {
    type: 'run-settled',
    report: { ...REPORT, status: 'cancelled' },
  })
  expect(cancelled.nodeReports?.size).toBe(0)
  expect(applyRunEvent(cancelled, { type: 'node-settled', runNumber: 219, node })).toBe(cancelled)
})
