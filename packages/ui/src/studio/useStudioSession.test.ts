import type { FlowDocument } from '@jobik/core'
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { JobikClient, RunStreamEvent } from '../client/index.js'
import { JobikServerError, NdjsonParseError } from '../client/index.js'
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

describe('loading', () => {
  it('lists flows and loads the first one into a clean draft', async () => {
    const { result } = setup(stubClient())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.flowId).toBe('publication')
    expect(result.current.descriptor?.name).toBe('publication')
    expect(result.current.draft?.baseRevision).toBe('rev-1')
    expect(result.current.draft?.dirty).toBe(false)
  })

  it('seeds the run input draft from the start descriptor', async () => {
    const { result } = setup(stubClient())
    await waitFor(() => expect(result.current.loading).toBe(false))

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

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(listFlows).toHaveBeenCalledTimes(1)
    expect(loadFlow).toHaveBeenCalledTimes(1)
  })
})

describe('editing', () => {
  it('marks the draft dirty on a node move', async () => {
    const { result } = setup(stubClient())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.moveNode({ nodeId: 'start1', position: { x: 10, y: 20 } }))

    expect(result.current.draft?.dirty).toBe(true)
    expect(result.current.draft?.document.layout.start1).toEqual({ x: 10, y: 20 })
  })

  it('marks the draft dirty on a new connection', async () => {
    const { result } = setup(stubClient())
    await waitFor(() => expect(result.current.loading).toBe(false))

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
  // actually on screen.
  it('validates the current draft against the server', async () => {
    const validate = vi.fn(async () => ({ valid: true }) as const)
    const { result } = setup(stubClient({ validate }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => result.current.validate())

    expect(validate).toHaveBeenCalledWith('publication', DOCUMENT)
  })

  it('clears dirty and adopts the new revision on save', async () => {
    const { result } = setup(stubClient())
    await waitFor(() => expect(result.current.loading).toBe(false))
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
    await waitFor(() => expect(result.current.loading).toBe(false))
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
    await waitFor(() => expect(result.current.loading).toBe(false))

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
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.moveNode({ nodeId: 'start1', position: { x: 5, y: 5 } }))

    await act(async () => result.current.reloadFromDisk())

    expect(result.current.draft?.baseRevision).toBe('rev-9')
    expect(result.current.draft?.dirty).toBe(false)
    expect(result.current.saveState).toEqual({ kind: 'idle' })
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
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => result.current.run({ title: 't' }))
    await waitFor(() => expect(result.current.running).toBe(false))

    expect(result.current.session?.runNumber).toBe(219)
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
    await waitFor(() => expect(result.current.loading).toBe(false))

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

  it('cancels by the run token from the first line', async () => {
    const cancelRun = vi.fn(async () => true as const)
    const { result } = setup(
      stubClient({
        cancelRun,
        startRun: async () =>
          streamOf([
            { type: 'run-accepted', runToken: 'tok-9' },
            { type: 'run-settled', report: { ...REPORT, status: 'cancelled' } },
          ]),
      }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => result.current.run({ title: 't' }))
    await act(async () => result.current.cancel())

    expect(cancelRun).toHaveBeenCalledWith('tok-9')
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
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => result.current.run({ title: 't' }))
    await waitFor(() => expect(result.current.running).toBe(false))

    expect(result.current.session?.failure).toEqual({
      _tag: null,
      message: 'Internal server error',
    })
    expect(result.current.lastReport).toBeUndefined()
  })

  it('surfaces a start failure as a value and never enters the running state', async () => {
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
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => result.current.run({ title: 't' }))

    expect(result.current.running).toBe(false)
    // R3: `errore` interpolates the template, so `JobikServerError.message` reads
    // 'The Jobik server rejected the request: no such start'. The server's own words are on
    // `.payload.message`, untouched, and that is what this asserts.
    expect(result.current.runError).toBeInstanceOf(JobikServerError)
    expect((result.current.runError as JobikServerError).payload.message).toBe('no such start')
  })

  // R16: `readNdjsonStream` throws `NdjsonParseError` mid-iteration on a protocol violation, and
  // `JobikClient.startRun`'s own promise does not catch it — the throw lands in the consumer's
  // `for await`. This asserts the hook owns that `try`/`catch` and turns it into a failed run
  // rather than an unhandled rejection: `running` settles to `false`, and the failure is visible
  // both on `runError` (the raw cause) and on the session the run panel renders from.
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
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => result.current.run({ title: 't' }))
    await waitFor(() => expect(result.current.running).toBe(false))

    expect(result.current.runError).toBeInstanceOf(NdjsonParseError)
    expect(result.current.session?.failure?.message).toContain('not valid JSON')
    expect(result.current.lastReport).toBeUndefined()
  })
})
