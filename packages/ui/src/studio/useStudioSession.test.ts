import type { FlowDocument, NodeStatus } from '@jobik/core'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JobikClient, RunStreamEvent } from '#client/index.js'
import { JobikServerError, JobikTransportError, NdjsonParseError } from '#client/index.js'
import { useStudioSession } from './useStudioSession.js'

const DOCUMENT = {
  format: 'jobik.flow',
  version: 1,
  connections: [],
  literals: {},
  layout: { start1: { x: 0, y: 0 } },
} as unknown as FlowDocument

const DESCRIPTOR = {
  id: 'publication',
  name: 'publication',
  documentFile: 'flow.jobik.json',
  startIds: ['start1'],
  nodes: [
    {
      id: 'start1',
      kind: 'start' as const,
      title: 'start',
      input: {
        nodeId: 'start1',
        fields: [
          {
            field: 'title',
            required: true,
            annotation: 'string',
            control: { kind: 'string' as const },
          },
        ],
      },
      output: {
        nodeId: 'start1',
        fields: [{ field: 'title', required: true, annotation: 'string' }],
      },
    },
  ],
}

function streamOf(events: readonly RunStreamEvent[]) {
  return (async function* () {
    for (const event of events) yield event
  })()
}

function stubClient(overrides: Partial<JobikClient> = {}): JobikClient {
  return {
    listFlows: async () => [{ id: 'publication', name: 'publication', nodeCount: 1 }],
    loadFlow: async () => ({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: 'rev-1' }),
    validate: async () => ({ valid: true }),
    save: async () => ({ revision: 'rev-2' }),
    startRun: async () => streamOf([{ type: 'run-accepted', runToken: 'tok' }]),
    cancelRun: async () => true,
    assetUrl: (descriptor) => `/api/assets/${descriptor.id}`,
    extensionBundleUrl: () => '/api/flows/publication/ui.js',
    ...overrides,
  }
}

function setup(client: JobikClient) {
  return renderHook(() =>
    useStudioSession({ client, externals: {}, importModule: async () => ({}), now: () => 1000 }),
  )
}

/** The hook no longer exposes `loading` (R10): a defined draft is the load having completed. */
async function waitForReady(result: { current: ReturnType<typeof useStudioSession> }) {
  await waitFor(() => expect(result.current.draft).toBeDefined())
}

/**
 * A macrotask boundary. Releasing a gate resolves a promise several microtask hops away from the
 * `setSession` it eventually drives, and an assertion that the session was *not* touched has
 * nothing to `waitFor`. A `setTimeout(0)` guarantees every one of those hops has already run.
 */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('loading', () => {
  it('lists flows and loads the first one into a clean draft', async () => {
    const { result } = setup(stubClient())

    await waitForReady(result)

    expect(result.current.flowId).toBe('publication')
    expect(result.current.descriptor?.name).toBe('publication')
    expect(result.current.draft?.baseRevision).toBe('rev-1')
    expect(result.current.draft?.dirty).toBe(false)
  })

  it('seeds the run input draft from the start descriptor', async () => {
    const { result } = setup(stubClient())
    await waitForReady(result)

    expect(result.current.inputDraft.title).toBe('')
    expect(result.current.startId).toBe('start1')
  })

  // R5: the mount effect is split into a discovery effect (`GET /api/flows`) and a load effect
  // (`GET /api/flows/:id`) that only fires once the id is known. A single effect that reads and
  // sets `flowId` in its own dependency list double-fires both requests on every real mount; this
  // asserts the fixed shape does not regress back to that.
  it('discovers the flow list and loads the selected flow exactly once each', async () => {
    const listFlows = vi.fn(async () => [{ id: 'publication', name: 'publication', nodeCount: 1 }])
    const loadFlow = vi.fn(async () => ({
      descriptor: DESCRIPTOR,
      document: DOCUMENT,
      revision: 'rev-1',
    }))
    const { result } = setup(stubClient({ listFlows, loadFlow }))

    await waitForReady(result)

    expect(listFlows).toHaveBeenCalledTimes(1)
    expect(loadFlow).toHaveBeenCalledTimes(1)
  })
})

describe('editing', () => {
  it('marks the draft dirty on a node move', async () => {
    const { result } = setup(stubClient())
    await waitForReady(result)

    act(() => result.current.moveNode({ nodeId: 'start1', position: { x: 10, y: 20 } }))

    expect(result.current.draft?.dirty).toBe(true)
    expect(result.current.draft?.document.layout.start1).toEqual({ x: 10, y: 20 })
  })

  it('marks the draft dirty on a new connection', async () => {
    const { result } = setup(stubClient())
    await waitForReady(result)

    act(() =>
      result.current.connect({
        source: 'start1',
        sourceField: 'title',
        target: 'render',
        targetField: 'title',
      }),
    )

    expect(result.current.draft?.document.connections).toHaveLength(1)
  })
})

describe('validate and save', () => {
  // R10: `validation` had no consumer (merged `Studio`/`FlowsSidebar` render nothing from it) and
  // is deleted, not left dangling. `validate()` itself stays, because `StudioApp` wires it to the
  // Validate button — the only thing left to assert is that it calls the server with the draft
  // actually on screen. There is nothing else observable here after R10: no state field records
  // the result, so a spy on the client call is the only remaining signal.
  it('validates the current draft against the server', async () => {
    const validate = vi.fn(async () => ({ valid: true }) as const)
    const { result } = setup(stubClient({ validate }))
    await waitForReady(result)

    await act(async () => result.current.validate())

    expect(validate).toHaveBeenCalledWith('publication', DOCUMENT)
  })

  it('clears dirty and adopts the new revision on save', async () => {
    const { result } = setup(stubClient())
    await waitForReady(result)
    act(() => result.current.moveNode({ nodeId: 'start1', position: { x: 5, y: 5 } }))

    await act(async () => result.current.save())

    expect(result.current.draft?.dirty).toBe(false)
    expect(result.current.draft?.baseRevision).toBe('rev-2')
  })

  it('enters the conflict state on 409 and never overwrites', async () => {
    const save = vi.fn(
      async () =>
        new JobikServerError({
          reason: 'changed on disk',
          status: 409,
          payload: {
            _tag: 'FlowRevisionConflictError',
            message: 'changed on disk',
            expectedRevision: 'rev-1',
            actualRevision: 'rev-9',
          },
        }),
    )
    const { result } = setup(stubClient({ save }))
    await waitForReady(result)
    act(() => result.current.moveNode({ nodeId: 'start1', position: { x: 5, y: 5 } }))

    await act(async () => result.current.save())

    expect(result.current.saveState).toEqual({
      kind: 'conflict',
      expectedRevision: 'rev-1',
      actualRevision: 'rev-9',
    })
    expect(result.current.draft?.dirty).toBe(true)
    expect(save).toHaveBeenCalledTimes(1)
  })

  // R18: `markSaved` compares the document actually sent, captured at call time, to the draft's
  // current document by identity. An edit that lands while the save is still in flight must not be
  // silently discarded: the new revision is adopted (so the next save targets the right base) but
  // the draft stays dirty.
  it('keeps a draft edit that lands while the save is still in flight', async () => {
    let resolveSave: (value: { revision: string }) => void = () => {}
    const gate = new Promise<{ revision: string }>((resolve) => {
      resolveSave = resolve
    })
    const save = vi.fn(async () => gate)
    const { result } = setup(stubClient({ save }))
    await waitForReady(result)

    act(() => result.current.save())
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))

    act(() => result.current.moveNode({ nodeId: 'start1', position: { x: 9, y: 9 } }))

    await act(async () => {
      resolveSave({ revision: 'rev-2' })
      await gate
    })
    await waitFor(() => expect(result.current.saveState).toEqual({ kind: 'idle' }))

    expect(result.current.draft?.baseRevision).toBe('rev-2')
    expect(result.current.draft?.dirty).toBe(true)
    expect(result.current.draft?.document.layout.start1).toEqual({ x: 9, y: 9 })
  })

  it('reloads from disk and discards the draft', async () => {
    const loadFlow = vi
      .fn()
      .mockResolvedValueOnce({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: 'rev-1' })
      .mockResolvedValueOnce({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: 'rev-9' })
    const { result } = setup(stubClient({ loadFlow }))
    await waitForReady(result)
    act(() => result.current.moveNode({ nodeId: 'start1', position: { x: 5, y: 5 } }))

    await act(async () => result.current.reloadFromDisk())

    expect(result.current.draft?.baseRevision).toBe('rev-9')
    expect(result.current.draft?.dirty).toBe(false)
    expect(result.current.saveState).toEqual({ kind: 'idle' })
  })

  // Minor: `reloadFromDisk()` and the mount load effect both call `adopt()`, and without a
  // generation guard, whichever response lands last wins regardless of which was actually
  // fresher. Here the mount load (call #1) is held open; `reloadFromDisk()` (call #2) resolves
  // first with `rev-9`, and the guard must keep call #1's late, now-stale `rev-1` from landing
  // on top of it.
  it('does not let a slow mount-load response overwrite a faster reloadFromDisk response', async () => {
    let resolveMountLoad: (value: {
      descriptor: typeof DESCRIPTOR
      document: typeof DOCUMENT
      revision: string
    }) => void = () => {}
    const mountLoadGate = new Promise<{
      descriptor: typeof DESCRIPTOR
      document: typeof DOCUMENT
      revision: string
    }>((resolve) => {
      resolveMountLoad = resolve
    })
    const loadFlow = vi
      .fn()
      .mockImplementationOnce(() => mountLoadGate)
      .mockResolvedValueOnce({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: 'rev-9' })

    const { result } = setup(stubClient({ loadFlow }))
    await waitFor(() => expect(loadFlow).toHaveBeenCalledTimes(1))

    await act(async () => {
      result.current.reloadFromDisk()
      await Promise.resolve()
    })
    await waitFor(() => expect(loadFlow).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.draft?.baseRevision).toBe('rev-9'))

    await act(async () => {
      resolveMountLoad({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: 'rev-1' })
      await mountLoadGate
    })

    expect(result.current.draft?.baseRevision).toBe('rev-9')
  })
})

describe('running', () => {
  const REPORT = {
    flowName: 'publication',
    startId: 'start1',
    runNumber: 219,
    status: 'ok' as const,
    elapsedMs: 2400,
    nodes: [
      {
        nodeId: 'start1',
        status: 'ok' as const,
        elapsedMs: 10,
        output: { title: 't' },
        assets: {},
        error: null,
      },
    ],
    logs: [],
    error: null,
  }

  it('streams to a settled session and exposes the run number', async () => {
    const { result } = setup(
      stubClient({
        startRun: async () =>
          streamOf([
            { type: 'run-accepted', runToken: 'tok' },
            {
              type: 'run-started',
              runNumber: 219,
              flowName: 'publication',
              startId: 'start1',
              nodeCount: 1,
            },
            { type: 'run-settled', report: REPORT },
          ]),
      }),
    )
    await waitForReady(result)

    await act(async () => result.current.run({ title: 't' }))
    await waitFor(() => expect(result.current.running).toBe(false))

    expect(result.current.session?.runNumber).toBe(219)
    expect(result.current.lastReport).toEqual(REPORT)
  })

  // Settling is ONE transition, and its two halves are read by two different parts of the editor:
  // the run dock renders from `lastReport`, the canvas node cards render from `session.nodes`.
  // While those were two `useState` values written by two setter calls, the stream's last
  // `setSession` and the `setLastReport` after the loop landed in different React commits whenever
  // a real task boundary separated them — which is exactly what the socket read that discovers
  // end-of-stream is — and React painted the frame in between. That frame contradicts itself:
  // today it draws finished node cards under a dock that still says the run is in flight, and
  // since `Node states` queued now draws `Waiting on <node>.<field>`, the mirror of it reads as
  // "finished, and also still waiting on an upstream node".
  //
  // Asserting the settled state *eventually* agrees is what `StudioApp.e2e.test.tsx` did, and it
  // is precisely what let this through. So this records every committed render and asserts the
  // invariant over the whole sequence rather than over its last frame.
  it('never commits the settled report and the node statuses out of step', async () => {
    const frames: {
      readonly reportExposed: boolean
      readonly sessionSettled: boolean
      readonly nodeStatuses: readonly NodeStatus[]
    }[] = []
    const client = stubClient({
      startRun: async () =>
        (async function* () {
          yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
          await flush()
          yield {
            type: 'node-status',
            nodeId: 'start1',
            status: 'running',
            elapsedMs: 5,
            error: null,
          } as RunStreamEvent
          await flush()
          yield { type: 'run-settled', report: REPORT } as RunStreamEvent
          // The gap a real reader has between the terminal line and end-of-stream: one more read
          // off the socket. `flush()` is what makes it a task boundary — without it every write in
          // and after the loop coalesces into a single commit and no frame is observable at all.
          await flush()
        })(),
    })

    const { result } = renderHook(() => {
      const studio = useStudioSession({
        client,
        externals: {},
        importModule: async () => ({}),
        now: () => 1000,
      })
      frames.push({
        reportExposed: studio.lastReport !== undefined,
        sessionSettled: studio.session?.report !== undefined,
        nodeStatuses: [...(studio.session?.nodes.values() ?? [])].map((node) => node.status),
      })
      return studio
    })
    await waitForReady(result)
    // Only the run's own commits are under test; the load's are not.
    frames.length = 0

    act(() => result.current.run({ title: 't' }))
    await waitFor(() => expect(result.current.running).toBe(false))
    await act(async () => flush())

    const torn = frames.filter(
      (frame) =>
        // The report the dock renders and the report the cards were settled from are the same
        // report, so no commit may carry one without the other...
        frame.reportExposed !== frame.sessionSettled ||
        // ...and a commit that exposes a settled report may not still be showing a node the run
        // has not reached: that is the `Waiting on …` line under a completed dock.
        (frame.reportExposed &&
          frame.nodeStatuses.some((status) => status === 'queued' || status === 'running')),
    )

    expect(torn).toEqual([])
    // Guards against passing vacuously: the run really did stream and really did settle.
    expect(frames.length).toBeGreaterThan(1)
    expect(result.current.lastReport).toEqual(REPORT)
  })

  it('locks the draft while the run is in flight', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const validate = vi.fn(async () => ({ valid: true }) as const)
    const { result } = setup(
      stubClient({
        validate,
        startRun: async () =>
          (async function* () {
            yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
            await gate
            yield { type: 'run-settled', report: REPORT } as RunStreamEvent
          })(),
      }),
    )
    await waitForReady(result)

    act(() => result.current.run({ title: 't' }))
    await waitFor(() => expect(result.current.running).toBe(true))

    act(() => result.current.validate())
    act(() => result.current.save())
    act(() => result.current.setInputField('title', 'ignored'))

    expect(validate).not.toHaveBeenCalled()
    expect(result.current.inputDraft.title).toBe('')

    await act(async () => {
      release()
      await gate
    })
    await waitFor(() => expect(result.current.running).toBe(false))
  })

  // Minor: `run()` sets `running` state asynchronously (it does not apply until the next render),
  // so two calls issued in the same tick both read `running === false` from their closures. This
  // asserts the hook guards re-entrancy itself, with a ref, rather than relying on state that has
  // not caught up yet: `startRun` must fire exactly once for two synchronous `run()` calls.
  it('ignores a second run() call issued before state catches up with the first', async () => {
    const startRun = vi.fn(async () =>
      streamOf([
        { type: 'run-accepted', runToken: 'tok' },
        { type: 'run-settled', report: REPORT },
      ]),
    )
    const { result } = setup(stubClient({ startRun }))
    await waitForReady(result)

    act(() => {
      result.current.run({ title: 't' })
      result.current.run({ title: 't' })
    })

    await waitFor(() => expect(result.current.running).toBe(false))
    expect(startRun).toHaveBeenCalledTimes(1)
  })

  // R26: the previous version of this test drained the whole stream before calling `cancel()` and
  // asserted only that `cancelRun` fired — a hook that never called `markCancelling` at all would
  // still pass it. This calls `cancel()` while the stream is still open (`run-accepted` has
  // landed, `run-settled` is gated behind `release()`) and asserts `session.cancelling` itself.
  it('marks the session cancelling while the stream is still open', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const cancelRun = vi.fn(async () => true as const)
    const { result } = setup(
      stubClient({
        cancelRun,
        startRun: async () =>
          (async function* () {
            yield { type: 'run-accepted', runToken: 'tok-9' } as RunStreamEvent
            await gate
            yield {
              type: 'run-settled',
              report: { ...REPORT, status: 'cancelled' as const },
            } as RunStreamEvent
          })(),
      }),
    )
    await waitForReady(result)

    act(() => result.current.run({ title: 't' }))
    await waitFor(() => expect(result.current.session?.runToken).toBe('tok-9'))
    expect(result.current.session?.cancelling).toBe(false)

    await act(async () => result.current.cancel())

    expect(cancelRun).toHaveBeenCalledWith('tok-9')
    expect(result.current.session?.cancelling).toBe(true)
    expect(result.current.running).toBe(true)

    await act(async () => {
      release()
      await gate
    })
    await waitFor(() => expect(result.current.running).toBe(false))
  })

  // R27: `cancel()` used to discard `client.cancelRun`'s `Promise<true | Error>` with a bare
  // `void`. If the cancel request itself failed (e.g. a transport error), `cancelling` stayed
  // `true` forever with nothing surfacing that the request never reached the server. This asserts
  // the failure lands on `session.failure`, the same surface R25 routes every other failure
  // through — never a new field.
  it('surfaces a failed cancel request on session.failure', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const cancelRun = vi.fn(async () => new JobikTransportError({ url: '/api/runs/tok-9/cancel' }))
    const { result } = setup(
      stubClient({
        cancelRun,
        startRun: async () =>
          (async function* () {
            yield { type: 'run-accepted', runToken: 'tok-9' } as RunStreamEvent
            await gate
            yield { type: 'run-settled', report: REPORT } as RunStreamEvent
          })(),
      }),
    )
    await waitForReady(result)

    act(() => result.current.run({ title: 't' }))
    await waitFor(() => expect(result.current.session?.runToken).toBe('tok-9'))

    await act(async () => result.current.cancel())

    expect(result.current.session?.cancelling).toBe(true)
    expect(result.current.session?.failure?._tag).toBe('JobikTransportError')

    await act(async () => {
      release()
      await gate
    })
  })

  it('settles on a run-failed line without a report', async () => {
    const { result } = setup(
      stubClient({
        startRun: async () =>
          streamOf([
            { type: 'run-accepted', runToken: 'tok' },
            { type: 'run-failed', error: { _tag: null, message: 'Internal server error' } },
          ]),
      }),
    )
    await waitForReady(result)

    await act(async () => result.current.run({ title: 't' }))
    await waitFor(() => expect(result.current.running).toBe(false))

    expect(result.current.session?.failure).toEqual({
      _tag: null,
      message: 'Internal server error',
    })
    expect(result.current.lastReport).toBeUndefined()
  })

  // R28: the stream ended cleanly (no thrown error) but without either terminal event. The
  // reducer in `runSession.ts` deliberately cannot repair this — it relies on the server's
  // structural guarantee. This asserts the hook itself ends the run as a failure the panel can
  // render, rather than letting it vanish with `report` and `failure` both `undefined`.
  it('ends a stream that closes without a terminal event as a failure', async () => {
    const { result } = setup(
      stubClient({
        startRun: async () =>
          streamOf([
            { type: 'run-accepted', runToken: 'tok' },
            {
              type: 'node-status',
              nodeId: 'start1',
              status: 'running',
              elapsedMs: 5,
              error: null,
            },
          ]),
      }),
    )
    await waitForReady(result)

    await act(async () => result.current.run({ title: 't' }))
    await waitFor(() => expect(result.current.running).toBe(false))

    expect(result.current.session?.report).toBeUndefined()
    expect(result.current.session?.failure).toBeDefined()
    expect(result.current.lastReport).toBeUndefined()
  })

  // R25: a start rejected by the server used to null the session and stash the failure only on
  // `runError`, which nothing consumed — `runPanelState` fell through to `kind: 'idle'` and the
  // failure vanished. This asserts the resulting session state the panel actually renders from:
  // `session.failure` carries the server's own words, untouched, on `.message` (not the
  // errore-interpolated wrapper message `JobikServerError.message` would give instead).
  it('renders a start rejected by the server as a failed session, not a vanished one', async () => {
    const { result } = setup(
      stubClient({
        startRun: async () =>
          new JobikServerError({
            reason: 'no such start',
            status: 404,
            payload: { _tag: 'StartNotFoundError', message: 'no such start' },
          }),
      }),
    )
    await waitForReady(result)

    await act(async () => result.current.run({ title: 't' }))

    expect(result.current.running).toBe(false)
    expect(result.current.session?.failure).toEqual({
      _tag: 'StartNotFoundError',
      message: 'no such start',
    })
  })

  // R25: a transport failure (no server payload at all) must still surface, honestly as what it
  // is — its own tag and its own message — rather than being silently dropped.
  it('renders a start that fails in transport as a failed session', async () => {
    const { result } = setup(
      stubClient({
        startRun: async () => new JobikTransportError({ url: '/api/flows/publication/run' }),
      }),
    )
    await waitForReady(result)

    await act(async () => result.current.run({ title: 't' }))

    expect(result.current.running).toBe(false)
    expect(result.current.session?.failure).toEqual({
      _tag: 'JobikTransportError',
      message: 'The Jobik server could not be reached at /api/flows/publication/run',
    })
  })

  // R16: `readNdjsonStream` throws `NdjsonParseError` mid-iteration on a protocol violation, and
  // `JobikClient.startRun`'s own promise does not catch it — the throw lands in the consumer's
  // `for await`. This asserts the hook owns that `try`/`catch` and turns it into a failed run
  // rather than an unhandled rejection: `running` settles to `false`, and the failure is visible
  // on the session the run panel renders from.
  it('turns a stream parse failure into a failed run, not an unhandled rejection', async () => {
    const { result } = setup(
      stubClient({
        startRun: async () =>
          (async function* () {
            yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
            throw new NdjsonParseError({
              message: 'The run stream contained a line that is not valid JSON: {bad',
            })
          })(),
      }),
    )
    await waitForReady(result)

    await act(async () => result.current.run({ title: 't' }))
    await waitFor(() => expect(result.current.running).toBe(false))

    expect(result.current.session?.failure?.message).toContain('not valid JSON')
    expect(result.current.lastReport).toBeUndefined()
  })

  // Deferred finding 8-B. A cancel that loses the race against the run's own terminal line is
  // answered `404` — the run has already left the server's registry — and R27 routed that `404`
  // straight onto `session.failure`, so the panel rendered `Error / Not found` in place of a
  // completed run and its outputs vanished. The stream and the cancel response are gated
  // independently here, so the losing order is deterministic rather than a real race: the run
  // settles first, the cancel's `404` lands after it.
  it('keeps a completed run report when a late cancel is answered 404', async () => {
    let releaseStream = () => {}
    const streamGate = new Promise<void>((resolve) => {
      releaseStream = resolve
    })
    let releaseCancel = () => {}
    const cancelGate = new Promise<void>((resolve) => {
      releaseCancel = resolve
    })
    const cancelRun = vi.fn(async () => {
      await cancelGate
      return new JobikServerError({
        reason: 'Not found',
        status: 404,
        payload: { _tag: null, message: 'Not found' },
      })
    })
    const { result } = setup(
      stubClient({
        cancelRun,
        startRun: async () =>
          (async function* () {
            yield { type: 'run-accepted', runToken: 'tok-9' } as RunStreamEvent
            await streamGate
            yield { type: 'run-settled', report: REPORT } as RunStreamEvent
          })(),
      }),
    )
    await waitForReady(result)

    act(() => result.current.run({ title: 't' }))
    await waitFor(() => expect(result.current.session?.runToken).toBe('tok-9'))

    // Clicked while the run was still live: the request is legitimately sent.
    act(() => result.current.cancel())
    expect(cancelRun).toHaveBeenCalledWith('tok-9')

    await act(async () => {
      releaseStream()
      await streamGate
    })
    await waitFor(() => expect(result.current.running).toBe(false))
    expect(result.current.session?.report).toEqual(REPORT)

    await act(async () => {
      releaseCancel()
      await flush()
    })

    expect(result.current.session?.report).toEqual(REPORT)
    expect(result.current.session?.failure).toBeUndefined()
    expect(result.current.lastReport).toEqual(REPORT)
  })

  // The same invariant on the other terminal line: a run that *failed* is settled too, and a
  // late cancel must not rewrite its error into the cancel's own. Without this the fix could be
  // written as "keep a report" and still lose the one thing a failed run has to show.
  it('keeps a failed run outcome when a late cancel is answered 404', async () => {
    let releaseStream = () => {}
    const streamGate = new Promise<void>((resolve) => {
      releaseStream = resolve
    })
    let releaseCancel = () => {}
    const cancelGate = new Promise<void>((resolve) => {
      releaseCancel = resolve
    })
    const cancelRun = vi.fn(async () => {
      await cancelGate
      return new JobikServerError({
        reason: 'Not found',
        status: 404,
        payload: { _tag: null, message: 'Not found' },
      })
    })
    const { result } = setup(
      stubClient({
        cancelRun,
        startRun: async () =>
          (async function* () {
            yield { type: 'run-accepted', runToken: 'tok-9' } as RunStreamEvent
            await streamGate
            yield {
              type: 'run-failed',
              error: { _tag: 'ImageRenderError', message: 'Unsupported colour profile CMYK' },
            } as RunStreamEvent
          })(),
      }),
    )
    await waitForReady(result)

    act(() => result.current.run({ title: 't' }))
    await waitFor(() => expect(result.current.session?.runToken).toBe('tok-9'))
    act(() => result.current.cancel())

    await act(async () => {
      releaseStream()
      await streamGate
    })
    await waitFor(() => expect(result.current.running).toBe(false))

    await act(async () => {
      releaseCancel()
      await flush()
    })

    expect(result.current.session?.failure).toEqual({
      _tag: 'ImageRenderError',
      message: 'Unsupported colour profile CMYK',
    })
  })

  // 8-B's fix must not be a blanket "ignore every failed cancel": a transport failure while the
  // run is genuinely live is a real error the user has to see, and a `404` is not special —
  // whatever the status, an unsettled session still takes the failure. This is the R27 case with
  // the server's own `404` payload rather than a transport error, so the fix cannot be written as
  // "drop 404" either.
  it('surfaces a cancel rejected with 404 while the run is still live', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const cancelRun = vi.fn(
      async () =>
        new JobikServerError({
          reason: 'Not found',
          status: 404,
          payload: { _tag: null, message: 'Not found' },
        }),
    )
    const { result } = setup(
      stubClient({
        cancelRun,
        startRun: async () =>
          (async function* () {
            yield { type: 'run-accepted', runToken: 'tok-9' } as RunStreamEvent
            await gate
            yield { type: 'run-settled', report: REPORT } as RunStreamEvent
          })(),
      }),
    )
    await waitForReady(result)

    act(() => result.current.run({ title: 't' }))
    await waitFor(() => expect(result.current.session?.runToken).toBe('tok-9'))

    await act(async () => result.current.cancel())

    expect(result.current.session?.failure).toEqual({ _tag: null, message: 'Not found' })

    await act(async () => {
      release()
      await gate
    })
  })

  // The other direction of the same invariant. `markCancelling` wrote `cancelling: true` through a
  // functional updater, but the stream loop wrote `setSession(current)` from a local variable it
  // had been folding events into since before the click — so the very next `node-status` line
  // replaced the state with a session that had never heard of the cancel. Measured directly:
  // `cancelling` went `true` on the click and back to `false` on the next event, which is the
  // `Cancelling…` affordance going dark and telling the user their click did nothing.
  //
  // The two gates make the order deterministic: the click lands with the stream open, then one
  // non-terminal event arrives, and only then does the run settle.
  it('keeps the session cancelling across the stream events that follow the click', async () => {
    let releaseStatus = () => {}
    const statusGate = new Promise<void>((resolve) => {
      releaseStatus = resolve
    })
    let releaseSettle = () => {}
    const settleGate = new Promise<void>((resolve) => {
      releaseSettle = resolve
    })
    const { result } = setup(
      stubClient({
        cancelRun: async () => true as const,
        startRun: async () =>
          (async function* () {
            yield { type: 'run-accepted', runToken: 'tok-9' } as RunStreamEvent
            await statusGate
            yield {
              type: 'node-status',
              nodeId: 'start1',
              status: 'running',
              elapsedMs: 5,
              error: null,
            } as RunStreamEvent
            await settleGate
            yield {
              type: 'run-settled',
              report: { ...REPORT, status: 'cancelled' as const },
            } as RunStreamEvent
          })(),
      }),
    )
    await waitForReady(result)

    act(() => result.current.run({ title: 't' }))
    await waitFor(() => expect(result.current.session?.runToken).toBe('tok-9'))

    await act(async () => result.current.cancel())
    expect(result.current.session?.cancelling).toBe(true)

    await act(async () => {
      releaseStatus()
      await flush()
    })

    // Not vacuous: the event really did land — and it did not take the cancel down with it.
    expect(result.current.session?.nodes.get('start1')?.status).toBe('running')
    expect(result.current.session?.cancelling).toBe(true)

    await act(async () => {
      releaseSettle()
      await flush()
    })
    await waitFor(() => expect(result.current.running).toBe(false))
  })

  // 8-B's ruling, in the order the earlier tests do not cover: the cancel request fails *first*,
  // while the run is genuinely live, and the run then settles on its own. The failure was real
  // when it landed (the test above pins that it surfaces), but the run's own report is the later
  // and more authoritative word — and `StudioApp.runPanelState` paints `kind: 'failed'` whenever
  // `session.failure !== undefined`, so leaving both set renders a successfully completed run as
  // an error with its outputs gone. The run's outcome wins; the stale request failure is dropped.
  it('drops a cancel-request failure once the run settles with its own report', async () => {
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const cancelRun = vi.fn(async () => new JobikTransportError({ url: '/api/runs/tok-9/cancel' }))
    const { result } = setup(
      stubClient({
        cancelRun,
        startRun: async () =>
          (async function* () {
            yield { type: 'run-accepted', runToken: 'tok-9' } as RunStreamEvent
            await gate
            yield { type: 'run-settled', report: REPORT } as RunStreamEvent
          })(),
      }),
    )
    await waitForReady(result)

    act(() => result.current.run({ title: 't' }))
    await waitFor(() => expect(result.current.session?.runToken).toBe('tok-9'))

    await act(async () => result.current.cancel())
    // R27, unchanged: while the run is live the failed request is real and the user sees it.
    expect(result.current.session?.failure?._tag).toBe('JobikTransportError')

    await act(async () => {
      release()
      await gate
    })
    await waitFor(() => expect(result.current.running).toBe(false))

    expect(result.current.session?.report).toEqual(REPORT)
    expect(result.current.session?.failure).toBeUndefined()
    expect(result.current.lastReport).toEqual(REPORT)
  })
})

describe('extension bundle', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // R29: the effect's dependency list used to include `args.externals` and `args.importModule`
  // directly. `StudioApp` (task 13) passes both as fresh object/function literals on every
  // render, and re-renders every `TICK_MS` while a run is in flight, so that dependency list
  // would refetch the bundle on every tick. This asserts the fix holds by giving the hook a new
  // `externals`/`importModule` identity on every rerender and checking the fetch still fires once.
  it('does not refetch the extension bundle when externals/importModule are new objects each render', async () => {
    const fetchSpy = vi.fn(
      async () => ({ ok: true, text: async () => 'export default {}' }) as unknown as Response,
    )
    vi.stubGlobal('fetch', fetchSpy)
    const client = stubClient()

    const { result, rerender } = renderHook(
      (props: { externals: Record<string, never>; importModule: () => Promise<unknown> }) =>
        useStudioSession({
          client,
          externals: props.externals,
          importModule: props.importModule,
          now: () => 1000,
        }),
      { initialProps: { externals: {}, importModule: async () => ({}) } },
    )

    await waitFor(() => expect(result.current.draft).toBeDefined())
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1))

    rerender({ externals: {}, importModule: async () => ({}) })
    rerender({ externals: {}, importModule: async () => ({}) })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
