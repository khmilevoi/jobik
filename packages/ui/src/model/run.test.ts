import type { FlowDocument, NodeKind, NodeStatus } from '@jobik/core'
import type { Action, Atom } from '@reatom/core'
import { action, atom, computed, context, sleep, wrap } from '@reatom/core'
import { describe, expect, it, vi } from 'vitest'
import type {
  JobikClient,
  RunStreamEvent,
  SafeFlowDescriptorPayload,
  WireErrorPayload,
} from '#client/index.js'
import { JobikServerError, JobikTransportError, NdjsonParseError } from '#client/index.js'
import type { RunInputIssue } from '#run/index.js'
import { reatomRun, reatomRunNodes } from './run.js'
import type { RunModel } from './types.js'

/**
 * The run session, driven directly rather than through a component.
 *
 * Every case below carries the name it had in `studio/useStudioSession.test.ts`, now deleted, so
 * the port stays auditable against that file's history; the cases that are new to the model —
 * the archive, the retry, the cancel dialog, the clock and the per-node atomization — are grouped
 * apart at the end and named for what they are.
 *
 * The shape is `context.start(async …)` with every continuation crossing `wrap`, which is what a
 * Reatom frame needs and what upstream's own async tests do. There is no `renderHook` and no `act`:
 * a model is a factory, and this is the whole reason it is one.
 */

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
  sourceFile: 'flow.ts',
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
} as unknown as SafeFlowDescriptorPayload

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

/**
 * `pokedex`, in the shape F06 was observed against: two starts whose pipelines share a document and
 * a canvas and not one node.
 *
 * ```
 *   card ──▶ lookup ──▶ sprite ──▶ compose
 *   roster ─▶ rank ───▶ standings
 * ```
 */
const PIPELINES_DOCUMENT = {
  format: 'jobik.flow',
  version: 1,
  connections: [
    { from: { node: 'card', field: 'out' }, to: { node: 'lookup', field: 'in' } },
    { from: { node: 'lookup', field: 'out' }, to: { node: 'sprite', field: 'in' } },
    { from: { node: 'lookup', field: 'out' }, to: { node: 'compose', field: 'in' } },
    { from: { node: 'sprite', field: 'out' }, to: { node: 'compose', field: 'in' } },
    { from: { node: 'roster', field: 'out' }, to: { node: 'rank', field: 'in' } },
    { from: { node: 'rank', field: 'out' }, to: { node: 'standings', field: 'in' } },
  ],
  literals: {},
  layout: {},
} as unknown as FlowDocument

/**
 * The join `pokedex`'s own binding warns against: `merge` is forward-reachable from `card` through
 * `compose`, but it is also fed by `standings`, which `card`'s run never produces.
 */
const JOINED_DOCUMENT = {
  ...PIPELINES_DOCUMENT,
  connections: [
    ...PIPELINES_DOCUMENT.connections,
    { from: { node: 'compose', field: 'out' }, to: { node: 'merge', field: 'in' } },
    { from: { node: 'standings', field: 'out' }, to: { node: 'merge', field: 'in' } },
    { from: { node: 'merge', field: 'out' }, to: { node: 'publish', field: 'in' } },
  ],
} as unknown as FlowDocument

function pipelineNode(id: string, kind: NodeKind) {
  return {
    id,
    kind,
    title: id,
    input: {
      nodeId: id,
      fields: [
        { field: 'in', required: true, annotation: 'string', control: { kind: 'string' as const } },
      ],
    },
    output: { nodeId: id, fields: [{ field: 'out', required: true, annotation: 'string' }] },
  }
}

const PIPELINES_DESCRIPTOR = {
  id: 'pokedex',
  name: 'pokedex',
  documentFile: 'flow.jobik.json',
  sourceFile: 'index.ts',
  startIds: ['card', 'roster'],
  nodes: [
    pipelineNode('card', 'start'),
    pipelineNode('lookup', 'transform'),
    pipelineNode('sprite', 'transform'),
    pipelineNode('compose', 'transform'),
    pipelineNode('roster', 'start'),
    pipelineNode('rank', 'transform'),
    pipelineNode('standings', 'transform'),
  ],
} as unknown as SafeFlowDescriptorPayload

const JOINED_DESCRIPTOR = {
  ...PIPELINES_DESCRIPTOR,
  nodes: [
    ...PIPELINES_DESCRIPTOR.nodes,
    pipelineNode('merge', 'transform'),
    pipelineNode('publish', 'sink'),
  ],
} as unknown as SafeFlowDescriptorPayload

function reportNode(nodeId: string, status: NodeStatus, error: WireErrorPayload | null = null) {
  return { nodeId, status, elapsedMs: 10, output: {}, assets: {}, error }
}

const CARD_REPORT = {
  flowName: 'pokedex',
  startId: 'card',
  runNumber: 221,
  status: 'ok' as const,
  elapsedMs: 2400,
  nodes: [
    reportNode('card', 'ok'),
    reportNode('lookup', 'ok'),
    reportNode('sprite', 'ok'),
    reportNode('compose', 'ok'),
  ],
  logs: [],
  error: null,
}

const LOOKUP_FAILED = { _tag: 'NodeHandlerError', message: 'pokeapi said no' }

const CARD_FAILURE_REPORT = {
  ...CARD_REPORT,
  status: 'failed' as const,
  nodes: [
    reportNode('card', 'ok'),
    reportNode('lookup', 'failed', LOOKUP_FAILED),
    reportNode('sprite', 'skipped'),
    reportNode('compose', 'skipped'),
  ],
  error: LOOKUP_FAILED,
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
    assetUrl: (asset: { readonly id: string }) => `/api/assets/${asset.id}`,
    extensionBundleUrl: () => '/api/flows/publication/ui.js',
    ...overrides,
  } as unknown as JobikClient
}

/**
 * The seven inputs `reatomRun` takes, as writable units a test can move.
 *
 * They stand in for `flows`, `draft`, `inputs` and `validation`, which are four other agents' files:
 * this module never imports one, and the harness is the proof of it.
 */
interface Harness {
  readonly model: RunModel
  readonly flowId: Atom<string | undefined>
  readonly descriptor: Atom<SafeFlowDescriptorPayload | undefined>
  readonly startId: Atom<string | undefined>
  readonly savedDocument: Atom<FlowDocument | undefined>
  readonly inputIssues: Atom<readonly RunInputIssue[] | undefined>
  readonly blocked: Atom<boolean>
  /** What `inputValues()` answers, and how often it was asked. */
  readonly draftValues: Atom<Record<string, unknown> | undefined>
  readonly inputValues: Action<[], Record<string, unknown> | undefined>
  /** The injected clock, movable so `elapsedMs` has something to measure. */
  readonly clock: { value: number }
}

function makeHarness(
  client: JobikClient,
  seed: {
    descriptor?: SafeFlowDescriptorPayload
    document?: FlowDocument
    startId?: string
    flowId?: string
  } = {},
): Harness {
  const flowId = atom<string | undefined>(seed.flowId ?? 'publication', 'test.flowId')
  const descriptor = atom<SafeFlowDescriptorPayload | undefined>(
    seed.descriptor ?? DESCRIPTOR,
    'test.descriptor',
  )
  const startId = atom<string | undefined>(seed.startId ?? 'start1', 'test.startId')
  const savedDocument = atom<FlowDocument | undefined>(seed.document ?? DOCUMENT, 'test.document')
  const inputIssues = atom<readonly RunInputIssue[] | undefined>(undefined, 'test.inputIssues')
  const blocked = atom(false, 'test.blocked')
  const draftValues = atom<Record<string, unknown> | undefined>({ title: 't' }, 'test.draftValues')
  const inputValues = action(() => draftValues(), 'test.inputValues')
  const clock = { value: 1000 }

  const model = reatomRun(
    { client, now: () => clock.value },
    {
      flowId,
      descriptor: computed(() => descriptor(), 'test.descriptorInput'),
      startId,
      savedDocument: computed(() => savedDocument(), 'test.savedDocumentInput'),
      inputValues,
      inputIssues,
      blocked: computed(() => blocked(), 'test.blockedInput'),
    },
    'test.run',
  )

  return {
    model,
    flowId,
    descriptor,
    startId,
    savedDocument,
    inputIssues,
    blocked,
    draftValues,
    inputValues,
    clock,
  }
}

/** One isolated Reatom frame per case, which is what `context.start` is for (RTM-L03's shape). */
function inFrame(body: (harness: Harness) => Promise<void>, harness: () => Harness): Promise<void> {
  return wrap(context.start(async () => body(harness())))
}

/**
 * A macrotask boundary. Releasing a gate resolves a promise several microtask hops away from the
 * write it eventually drives, and an assertion that a unit was *not* touched has nothing to wait
 * for. `sleep(0)` guarantees every one of those hops has already run.
 */
function flush(): Promise<unknown> {
  return wrap(sleep(0))
}

function gate(): { readonly promise: Promise<void>; release: () => void } {
  let release = () => {}
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}

function statusesOf(model: RunModel): Record<string, NodeStatus> {
  return Object.fromEntries(
    [...(model.session()?.nodes ?? [])].map(([nodeId, record]) => [nodeId, record.status]),
  )
}

describe('running', () => {
  it('streams to a settled session and exposes the run number', async () => {
    await inFrame(
      async ({ model }) => {
        await wrap(model.start({ title: 't' }))

        expect(model.running()).toBe(false)
        expect(model.session()?.runNumber).toBe(219)
        expect(model.lastReport()).toEqual(REPORT)
      },
      () =>
        makeHarness(
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
        ),
    )
  })

  // Settling is ONE transition, and its two halves are read by two different parts of the editor:
  // the run dock renders from `lastReport`, the canvas node cards render from `session.nodes`. In
  // the hook those were two `useState` values written by two setters, and React painted the frame
  // in between — finished node cards under a dock that still said the run was in flight. Here
  // `lastReport` is derived from `session`, so this records every state the model published and
  // asserts the invariant over the whole sequence rather than over its last value.
  it('never commits the settled report and the node statuses out of step', async () => {
    await inFrame(
      async ({ model }) => {
        const frames: {
          readonly reportExposed: boolean
          readonly sessionSettled: boolean
          readonly nodeStatuses: readonly NodeStatus[]
        }[] = []
        const view = computed(
          () => ({
            reportExposed: model.lastReport() !== undefined,
            sessionSettled: model.session()?.report !== undefined,
            nodeStatuses: [...(model.session()?.nodes.values() ?? [])].map((node) => node.status),
          }),
          'test.frames',
        )
        const unsubscribe = view.subscribe((frame) => frames.push(frame))

        await wrap(model.start({ title: 't' }))
        await flush()
        unsubscribe()

        const torn = frames.filter(
          (frame) =>
            // The report the dock renders and the report the cards were settled from are the same
            // report, so no state may carry one without the other...
            frame.reportExposed !== frame.sessionSettled ||
            // ...and a state that exposes a settled report may not still be showing a node the run
            // has not reached: that is the `Waiting on …` line under a completed dock.
            (frame.reportExposed &&
              frame.nodeStatuses.some((status) => status === 'queued' || status === 'running')),
        )

        expect(torn).toEqual([])
        // Guards against passing vacuously: the run really did stream and really did settle.
        expect(frames.length).toBeGreaterThan(1)
        expect(model.lastReport()).toEqual(REPORT)
      },
      () =>
        makeHarness(
          stubClient({
            startRun: async () =>
              (async function* () {
                yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
                await sleep(0)
                yield {
                  type: 'node-status',
                  nodeId: 'start1',
                  status: 'running',
                  elapsedMs: 5,
                  error: null,
                } as RunStreamEvent
                await sleep(0)
                yield { type: 'run-settled', report: REPORT } as RunStreamEvent
                await sleep(0)
              })(),
          }),
        ),
    )
  })

  // The draft lock's source. `RunModel.running` is what every other sub-model receives as `locked`,
  // so what this module owes is that the flag is true for exactly as long as the stream is open —
  // the three refusals it drives (`validate`, `save`, `setInputField`) belong to `model/validation`,
  // `model/save` and `model/inputs`, which are three other agents' files.
  it('locks the draft while the run is in flight', async () => {
    const streamGate = gate()
    await inFrame(
      async ({ model }) => {
        expect(model.running()).toBe(false)
        const pending = model.start({ title: 't' })
        expect(model.running()).toBe(true)

        await flush()
        expect(model.running()).toBe(true)

        streamGate.release()
        await wrap(pending)
        expect(model.running()).toBe(false)
      },
      () =>
        makeHarness(
          stubClient({
            startRun: async () =>
              (async function* () {
                yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
                await streamGate.promise
                yield { type: 'run-settled', report: REPORT } as RunStreamEvent
              })(),
          }),
        ),
    )
  })

  // In the hook this needed a ref: `setRunning(true)` did not apply until the next render, so two
  // calls in one tick both read `running === false` from their closures. A Reatom write is
  // immediate, and this pins that the guard survived the move: `startRun` fires exactly once.
  it('ignores a second run() call issued before state catches up with the first', async () => {
    const startRun = vi.fn(async () =>
      streamOf([
        { type: 'run-accepted', runToken: 'tok' },
        { type: 'run-settled', report: REPORT },
      ]),
    )
    await inFrame(
      async ({ model }) => {
        const first = model.start({ title: 't' })
        const second = model.start({ title: 't' })
        await wrap(first)
        await wrap(second)

        expect(model.running()).toBe(false)
        expect(startRun).toHaveBeenCalledTimes(1)
      },
      () => makeHarness(stubClient({ startRun })),
    )
  })

  // R26: `cancel()` is called while the stream is still open (`run-accepted` has landed,
  // `run-settled` is gated) and `session.cancelling` itself is asserted — a model that never called
  // `markCancelling` at all would pass a test that only checked `cancelRun` fired.
  it('marks the session cancelling while the stream is still open', async () => {
    const streamGate = gate()
    const cancelRun = vi.fn(async () => true as const)
    await inFrame(
      async ({ model }) => {
        const pending = model.start({ title: 't' })
        await flush()
        expect(model.session()?.runToken).toBe('tok-9')
        expect(model.session()?.cancelling).toBe(false)

        await wrap(model.cancel())

        expect(cancelRun).toHaveBeenCalledWith('tok-9')
        expect(model.session()?.cancelling).toBe(true)
        expect(model.running()).toBe(true)

        streamGate.release()
        await wrap(pending)
        expect(model.running()).toBe(false)
      },
      () =>
        makeHarness(
          stubClient({
            cancelRun,
            startRun: async () =>
              (async function* () {
                yield { type: 'run-accepted', runToken: 'tok-9' } as RunStreamEvent
                await streamGate.promise
                yield {
                  type: 'run-settled',
                  report: { ...REPORT, status: 'cancelled' as const },
                } as RunStreamEvent
              })(),
          }),
        ),
    )
  })

  // R27: a cancel request that fails leaves `cancelling: true` with nothing telling the user the
  // request never reached the server. The failure lands on `session.failure`, the same surface R25
  // routes every other failure through — never a new field.
  it('surfaces a failed cancel request on session.failure', async () => {
    const streamGate = gate()
    const cancelRun = vi.fn(async () => new JobikTransportError({ url: '/api/runs/tok-9/cancel' }))
    await inFrame(
      async ({ model }) => {
        const pending = model.start({ title: 't' })
        await flush()
        expect(model.session()?.runToken).toBe('tok-9')

        await wrap(model.cancel())

        expect(model.session()?.cancelling).toBe(true)
        expect(model.session()?.failure?._tag).toBe('JobikTransportError')

        streamGate.release()
        await wrap(pending)
      },
      () =>
        makeHarness(
          stubClient({
            cancelRun,
            startRun: async () =>
              (async function* () {
                yield { type: 'run-accepted', runToken: 'tok-9' } as RunStreamEvent
                await streamGate.promise
                yield { type: 'run-settled', report: REPORT } as RunStreamEvent
              })(),
          }),
        ),
    )
  })

  it('settles on a run-failed line without a report', async () => {
    await inFrame(
      async ({ model }) => {
        await wrap(model.start({ title: 't' }))

        expect(model.running()).toBe(false)
        expect(model.session()?.failure).toEqual({
          _tag: null,
          message: 'Internal server error',
        })
        expect(model.lastReport()).toBeUndefined()
      },
      () =>
        makeHarness(
          stubClient({
            startRun: async () =>
              streamOf([
                { type: 'run-accepted', runToken: 'tok' },
                { type: 'run-failed', error: { _tag: null, message: 'Internal server error' } },
              ]),
          }),
        ),
    )
  })

  // R28: the stream ended cleanly (no thrown error) but without either terminal event. The reducer
  // in `runSession.ts` deliberately cannot repair this — it relies on the server's structural
  // guarantee — so the model ends the run as a failure the panel can render, rather than letting it
  // vanish with `report` and `failure` both `undefined`.
  it('ends a stream that closes without a terminal event as a failure', async () => {
    await inFrame(
      async ({ model }) => {
        await wrap(model.start({ title: 't' }))

        expect(model.running()).toBe(false)
        expect(model.session()?.report).toBeUndefined()
        expect(model.session()?.failure).toBeDefined()
        expect(model.lastReport()).toBeUndefined()
      },
      () =>
        makeHarness(
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
        ),
    )
  })

  // R25: a start rejected by the server used to null the session and stash the failure where
  // nothing consumed it, so the panel fell through to `idle` and the failure vanished. The
  // server's own words survive untouched on `.message` — not the errore-interpolated wrapper
  // message `JobikServerError.message` would give instead.
  it('renders a start rejected by the server as a failed session, not a vanished one', async () => {
    await inFrame(
      async ({ model }) => {
        await wrap(model.start({ title: 't' }))

        expect(model.running()).toBe(false)
        expect(model.session()?.failure).toEqual({
          _tag: 'StartNotFoundError',
          message: 'no such start',
        })
      },
      () =>
        makeHarness(
          stubClient({
            startRun: async () =>
              new JobikServerError({
                reason: 'no such start',
                status: 404,
                payload: { _tag: 'StartNotFoundError', message: 'no such start' },
              }),
          }),
        ),
    )
  })

  // R25: a transport failure (no server payload at all) must still surface, honestly as what it is
  // — its own tag and its own message — rather than being silently dropped.
  it('renders a start that fails in transport as a failed session', async () => {
    await inFrame(
      async ({ model }) => {
        await wrap(model.start({ title: 't' }))

        expect(model.running()).toBe(false)
        expect(model.session()?.failure).toEqual({
          _tag: 'JobikTransportError',
          message: 'The Jobik server could not be reached at /api/flows/publication/run',
        })
      },
      () =>
        makeHarness(
          stubClient({
            startRun: async () => new JobikTransportError({ url: '/api/flows/publication/run' }),
          }),
        ),
    )
  })

  // R16: `readNdjsonStream` throws `NdjsonParseError` mid-iteration on a protocol violation, and
  // `JobikClient.startRun`'s own promise does not catch it — the throw lands in the consumer's
  // iteration. This asserts the model owns that `try`/`catch` and turns it into a failed run rather
  // than an unhandled rejection.
  it('turns a stream parse failure into a failed run, not an unhandled rejection', async () => {
    await inFrame(
      async ({ model }) => {
        await wrap(model.start({ title: 't' }))

        expect(model.running()).toBe(false)
        expect(model.session()?.failure?.message).toContain('not valid JSON')
        expect(model.lastReport()).toBeUndefined()
      },
      () =>
        makeHarness(
          stubClient({
            startRun: async () =>
              (async function* () {
                yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
                throw new NdjsonParseError({
                  message: 'The run stream contained a line that is not valid JSON: {bad',
                })
              })(),
          }),
        ),
    )
  })

  // Deferred finding 8-B. A cancel that loses the race against the run's own terminal line is
  // answered `404` — the run has already left the server's registry — and R27 routed that `404`
  // straight onto `session.failure`, so the panel rendered `Error / Not found` in place of a
  // completed run and its outputs vanished. The stream and the cancel response are gated
  // independently, so the losing order is deterministic rather than a real race.
  it('keeps a completed run report when a late cancel is answered 404', async () => {
    const streamGate = gate()
    const cancelGate = gate()
    const cancelRun = vi.fn(async () => {
      await cancelGate.promise
      return new JobikServerError({
        reason: 'Not found',
        status: 404,
        payload: { _tag: null, message: 'Not found' },
      })
    })
    await inFrame(
      async ({ model }) => {
        const pending = model.start({ title: 't' })
        await flush()
        expect(model.session()?.runToken).toBe('tok-9')

        // Clicked while the run was still live: the request is legitimately sent.
        const cancelling = model.cancel()
        expect(cancelRun).toHaveBeenCalledWith('tok-9')

        streamGate.release()
        await wrap(pending)
        expect(model.running()).toBe(false)
        expect(model.session()?.report).toEqual(REPORT)

        cancelGate.release()
        await wrap(cancelling)
        await flush()

        expect(model.session()?.report).toEqual(REPORT)
        expect(model.session()?.failure).toBeUndefined()
        expect(model.lastReport()).toEqual(REPORT)
      },
      () =>
        makeHarness(
          stubClient({
            cancelRun,
            startRun: async () =>
              (async function* () {
                yield { type: 'run-accepted', runToken: 'tok-9' } as RunStreamEvent
                await streamGate.promise
                yield { type: 'run-settled', report: REPORT } as RunStreamEvent
              })(),
          }),
        ),
    )
  })

  // The same invariant on the other terminal line: a run that *failed* is settled too, and a late
  // cancel must not rewrite its error into the cancel's own. Without this the fix could be written
  // as "keep a report" and still lose the one thing a failed run has to show.
  it('keeps a failed run outcome when a late cancel is answered 404', async () => {
    const streamGate = gate()
    const cancelGate = gate()
    const cancelRun = vi.fn(async () => {
      await cancelGate.promise
      return new JobikServerError({
        reason: 'Not found',
        status: 404,
        payload: { _tag: null, message: 'Not found' },
      })
    })
    await inFrame(
      async ({ model }) => {
        const pending = model.start({ title: 't' })
        await flush()
        const cancelling = model.cancel()

        streamGate.release()
        await wrap(pending)
        expect(model.running()).toBe(false)

        cancelGate.release()
        await wrap(cancelling)
        await flush()

        expect(model.session()?.failure).toEqual({
          _tag: 'ImageRenderError',
          message: 'Unsupported colour profile CMYK',
        })
      },
      () =>
        makeHarness(
          stubClient({
            cancelRun,
            startRun: async () =>
              (async function* () {
                yield { type: 'run-accepted', runToken: 'tok-9' } as RunStreamEvent
                await streamGate.promise
                yield {
                  type: 'run-failed',
                  error: { _tag: 'ImageRenderError', message: 'Unsupported colour profile CMYK' },
                } as RunStreamEvent
              })(),
          }),
        ),
    )
  })

  // 8-B's fix must not be a blanket "ignore every failed cancel": a transport failure while the run
  // is genuinely live is a real error the user has to see, and a `404` is not special — whatever
  // the status, an unsettled session still takes the failure. This is the R27 case with the
  // server's own `404` payload, so the fix cannot be written as "drop 404" either.
  it('surfaces a cancel rejected with 404 while the run is still live', async () => {
    const streamGate = gate()
    const cancelRun = vi.fn(
      async () =>
        new JobikServerError({
          reason: 'Not found',
          status: 404,
          payload: { _tag: null, message: 'Not found' },
        }),
    )
    await inFrame(
      async ({ model }) => {
        const pending = model.start({ title: 't' })
        await flush()
        expect(model.session()?.runToken).toBe('tok-9')

        await wrap(model.cancel())

        expect(model.session()?.failure).toEqual({ _tag: null, message: 'Not found' })

        streamGate.release()
        await wrap(pending)
      },
      () =>
        makeHarness(
          stubClient({
            cancelRun,
            startRun: async () =>
              (async function* () {
                yield { type: 'run-accepted', runToken: 'tok-9' } as RunStreamEvent
                await streamGate.promise
                yield { type: 'run-settled', report: REPORT } as RunStreamEvent
              })(),
          }),
        ),
    )
  })

  // The other direction of the same invariant. In the hook the stream loop folded events into a
  // local copy of the session taken before the click, so the very next `node-status` line replaced
  // the state with a session that had never heard of the cancel: `Cancelling…` went dark and told
  // the user their click had done nothing. Here every write reads the session as it stands.
  it('keeps the session cancelling across the stream events that follow the click', async () => {
    const statusGate = gate()
    const settleGate = gate()
    await inFrame(
      async ({ model }) => {
        const pending = model.start({ title: 't' })
        await flush()
        expect(model.session()?.runToken).toBe('tok-9')

        await wrap(model.cancel())
        expect(model.session()?.cancelling).toBe(true)

        statusGate.release()
        await flush()

        // Not vacuous: the event really did land — and it did not take the cancel down with it.
        expect(model.session()?.nodes.get('start1')?.status).toBe('running')
        expect(model.session()?.cancelling).toBe(true)

        settleGate.release()
        await wrap(pending)
        expect(model.running()).toBe(false)
      },
      () =>
        makeHarness(
          stubClient({
            cancelRun: async () => true as const,
            startRun: async () =>
              (async function* () {
                yield { type: 'run-accepted', runToken: 'tok-9' } as RunStreamEvent
                await statusGate.promise
                yield {
                  type: 'node-status',
                  nodeId: 'start1',
                  status: 'running',
                  elapsedMs: 5,
                  error: null,
                } as RunStreamEvent
                await settleGate.promise
                yield {
                  type: 'run-settled',
                  report: { ...REPORT, status: 'cancelled' as const },
                } as RunStreamEvent
              })(),
          }),
        ),
    )
  })

  // 8-B's ruling in the order the earlier cases do not cover: the cancel request fails *first*,
  // while the run is genuinely live, and the run then settles on its own. The failure was real when
  // it landed, but the run's own report is the later and more authoritative word — and the panel
  // paints `kind: 'failed'` whenever `session.failure !== undefined`, so leaving both set renders a
  // successfully completed run as an error with its outputs gone.
  it('drops a cancel-request failure once the run settles with its own report', async () => {
    const streamGate = gate()
    const cancelRun = vi.fn(async () => new JobikTransportError({ url: '/api/runs/tok-9/cancel' }))
    await inFrame(
      async ({ model }) => {
        const pending = model.start({ title: 't' })
        await flush()
        expect(model.session()?.runToken).toBe('tok-9')

        await wrap(model.cancel())
        // R27, unchanged: while the run is live the failed request is real and the user sees it.
        expect(model.session()?.failure?._tag).toBe('JobikTransportError')

        streamGate.release()
        await wrap(pending)

        expect(model.running()).toBe(false)
        expect(model.session()?.report).toEqual(REPORT)
        expect(model.session()?.failure).toBeUndefined()
        expect(model.lastReport()).toEqual(REPORT)
      },
      () =>
        makeHarness(
          stubClient({
            cancelRun,
            startRun: async () =>
              (async function* () {
                yield { type: 'run-accepted', runToken: 'tok-9' } as RunStreamEvent
                await streamGate.promise
                yield { type: 'run-settled', report: REPORT } as RunStreamEvent
              })(),
          }),
        ),
    )
  })
})

describe('switching flows', () => {
  /**
   * The switch is immediate; the run keeps going server-side and is drained to completion so the
   * server settles it; its events simply stop reaching the panel. `reset()` is this module's half
   * of what `selectFlow` used to do in one commit.
   */
  it('never blocks on a run in flight, and that run never paints the new flow', async () => {
    const streamGate = gate()
    const drained: string[] = []
    await inFrame(
      async ({ model }) => {
        const pending = model.start({ title: 't' })
        expect(model.running()).toBe(true)

        model.reset()
        expect(model.running()).toBe(false)
        expect(model.session()).toBeUndefined()

        streamGate.release()
        await wrap(pending)
        await flush()

        // Drained to the end — the server settles the run rather than being left with a reader that
        // walked away — and not one of those events reached the panel.
        expect(drained).toEqual(['run-accepted', 'run-started', 'run-settled'])
        expect(model.session()).toBeUndefined()
        expect(model.lastReport()).toBeUndefined()
        expect(model.running()).toBe(false)
      },
      () =>
        makeHarness(
          stubClient({
            startRun: async () =>
              (async function* () {
                yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
                drained.push('run-accepted')
                await streamGate.promise
                yield {
                  type: 'run-started',
                  runNumber: 219,
                  flowName: 'publication',
                  startId: 'start1',
                  nodeCount: 1,
                } as RunStreamEvent
                drained.push('run-started')
                yield { type: 'run-settled', report: REPORT } as RunStreamEvent
                drained.push('run-settled')
              })(),
          }),
        ),
    )
  })

  /**
   * `3F`'s `Switch and keep running`, followed all the way to the end.
   *
   * Draining the stream is only half of that promise. The run the user chose to keep settles on the
   * server, and its report belongs to the flow it was *started* under — so it has to reach that
   * flow's archive even though nothing it says may touch the surfaces any more. Otherwise the arm
   * whose whole point is that the run survives loses it: no history row, no toast, and nothing
   * under `Runs` on the way back.
   *
   * The archive is keyed by flow, so this also pins the other half: the run never appears under the
   * name of the flow the user switched to.
   */
  it('files a run that outlived the switch under the flow it was started on', async () => {
    const streamGate = gate()
    await inFrame(
      async ({ model, flowId }) => {
        const pending = model.start({ title: 't' })
        expect(model.running()).toBe(true)

        // One flow switch, in `commitSwitch`'s own order: every reset, then the id moves.
        model.reset()
        flowId.set('pokedex')

        streamGate.release()
        await wrap(pending)
        await flush()

        // Nothing reached the surfaces, and nothing was filed under the flow now open.
        expect(model.session()).toBeUndefined()
        expect(model.lastReport()).toBeUndefined()
        expect(model.running()).toBe(false)
        expect(model.archive()).toEqual([])
        expect(model.history()).toEqual([])

        // Back on `publication`: the run the user kept is waiting, exactly as `3F` promises.
        model.reset()
        flowId.set('publication')

        expect(model.history()).toEqual([
          { id: '219', label: '#219', status: 'ok', elapsed: '2.4s' },
        ])
        model.selectRun('219')
        expect(model.viewedSession()?.report).toEqual(REPORT)
      },
      () =>
        makeHarness(
          stubClient({
            startRun: async () =>
              (async function* () {
                yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
                await streamGate.promise
                yield {
                  type: 'run-started',
                  runNumber: 219,
                  flowName: 'publication',
                  startId: 'start1',
                  nodeCount: 1,
                } as RunStreamEvent
                yield { type: 'run-settled', report: REPORT } as RunStreamEvent
              })(),
          }),
        ),
    )
  })
})

describe('choosing a start', () => {
  it('runs the start it is pointed at, not the first one', async () => {
    const startRun = vi.fn(async () => streamOf([{ type: 'run-accepted' as const, runToken: 't' }]))
    await inFrame(
      async ({ model }) => {
        await wrap(model.start({ in: 'attack' }))

        expect(startRun).toHaveBeenCalledWith({
          flowId: 'pokedex',
          startId: 'roster',
          input: { in: 'attack' },
        })
      },
      () =>
        makeHarness(stubClient({ startRun }), {
          flowId: 'pokedex',
          descriptor: PIPELINES_DESCRIPTOR,
          document: PIPELINES_DOCUMENT,
          startId: 'roster',
        }),
    )
  })
})

/**
 * F06. The session used to be seeded with every node in the flow, so `pokedex`'s other pipeline was
 * painted `queued` for the length of a run that could never reach it — and stayed queued inside the
 * settled report, with `rank` reading `Waiting on roster.names` under a run that had finished.
 */
describe('the run graph the panel seeds', () => {
  it('seeds only the nodes the selected start can reach', async () => {
    await inFrame(
      async ({ model }) => {
        await wrap(model.start({ in: 'pikachu' }))

        expect(statusesOf(model)).toEqual({
          card: 'queued',
          lookup: 'queued',
          sprite: 'queued',
          compose: 'queued',
        })
        // `run-started`'s `nodeCount` is the wire's own answer, and the progress denominator reads
        // this until that line lands. They have to be the same number.
        expect(model.session()?.nodeCount).toBe(4)
      },
      () =>
        makeHarness(stubClient(), {
          flowId: 'pokedex',
          descriptor: PIPELINES_DESCRIPTOR,
          document: PIPELINES_DOCUMENT,
          startId: 'card',
        }),
    )
  })

  it('seeds the other pipeline when the panel is pointed at the other start', async () => {
    await inFrame(
      async ({ model }) => {
        await wrap(model.start({ in: 'attack' }))

        expect(Object.keys(statusesOf(model))).toEqual(['roster', 'rank', 'standings'])
      },
      () =>
        makeHarness(stubClient(), {
          flowId: 'pokedex',
          descriptor: PIPELINES_DESCRIPTOR,
          document: PIPELINES_DOCUMENT,
          startId: 'roster',
        }),
    )
  })

  // Core's second rule: a node fed from outside the run can never execute, and neither can anything
  // below it. The browser has no topological order to settle that in one pass, so this is what
  // proves the fixpoint standing in for one actually cascades.
  it('drops a node fed by both starts, and everything below it, from either run', async () => {
    await inFrame(
      async ({ model }) => {
        await wrap(model.start({ in: 'pikachu' }))

        expect(Object.keys(statusesOf(model))).toEqual(['card', 'lookup', 'sprite', 'compose'])
      },
      () =>
        makeHarness(stubClient(), {
          flowId: 'pokedex',
          descriptor: JOINED_DESCRIPTOR,
          document: JOINED_DOCUMENT,
          startId: 'card',
        }),
    )
  })

  it('holds exactly the nodes the report names once the run settles', async () => {
    await inFrame(
      async ({ model }) => {
        await wrap(model.start({ in: 'pikachu' }))

        expect(statusesOf(model)).toEqual({
          card: 'ok',
          lookup: 'ok',
          sprite: 'ok',
          compose: 'ok',
        })
      },
      () =>
        makeHarness(
          stubClient({
            startRun: async () =>
              streamOf([
                { type: 'run-accepted', runToken: 'tok' },
                {
                  type: 'run-started',
                  runNumber: 221,
                  flowName: 'pokedex',
                  startId: 'card',
                  nodeCount: 4,
                },
                { type: 'run-settled', report: CARD_REPORT },
              ]),
          }),
          {
            flowId: 'pokedex',
            descriptor: PIPELINES_DESCRIPTOR,
            document: PIPELINES_DOCUMENT,
            startId: 'card',
          },
        ),
    )
  })

  /**
   * The sharpest form of the finding. A failed run really does settle nodes as `skipped`, so the
   * panel used to print `sprite skipped` beside `roster queued` — two words for *did not run*, of
   * which only one was true, and only one was about this run at all.
   */
  it('never leaves a queued node beside a skipped one when a run fails', async () => {
    await inFrame(
      async ({ model }) => {
        await wrap(model.start({ in: 'pikachu' }))

        expect(statusesOf(model)).toEqual({
          card: 'ok',
          lookup: 'failed',
          sprite: 'skipped',
          compose: 'skipped',
        })
      },
      () =>
        makeHarness(
          stubClient({
            startRun: async () =>
              streamOf([
                { type: 'run-accepted', runToken: 'tok' },
                {
                  type: 'run-started',
                  runNumber: 221,
                  flowName: 'pokedex',
                  startId: 'card',
                  nodeCount: 4,
                },
                { type: 'run-settled', report: CARD_FAILURE_REPORT },
              ]),
          }),
          {
            flowId: 'pokedex',
            descriptor: PIPELINES_DESCRIPTOR,
            document: PIPELINES_DOCUMENT,
            startId: 'card',
          },
        ),
    )
  })
})

/**
 * The surfaces `StudioApp` held beside the hook and the model now owns: the archive, the row a
 * click picks, `3B`'s retry and `3C`'s cancel dialog. Named for what they are — there was no
 * `useStudioSession` case to inherit a name from.
 */
describe('the run archive', () => {
  const SECOND_REPORT = { ...REPORT, runNumber: 220, status: 'failed' as const, error: null }

  function settling(report: typeof REPORT | typeof SECOND_REPORT) {
    return stubClient({
      startRun: async () =>
        streamOf([
          { type: 'run-accepted', runToken: 'tok' },
          { type: 'run-settled', report },
        ]),
    })
  }

  it('keeps every settled run, newest first, exactly once per run number', async () => {
    await inFrame(
      async ({ model }) => {
        await wrap(model.start({ title: 't' }))
        await wrap(model.start({ title: 't' }))

        expect(model.archive().map((entry) => entry.report?.runNumber)).toEqual([219])
        expect(model.history()).toEqual([
          { id: '219', label: '#219', status: 'ok', elapsed: '2.4s' },
        ])
      },
      () => makeHarness(settling(REPORT)),
    )
  })

  it('never joins a run that produced no report', async () => {
    await inFrame(
      async ({ model }) => {
        await wrap(model.start({ title: 't' }))

        expect(model.session()?.failure).toBeDefined()
        expect(model.archive()).toEqual([])
        expect(model.history()).toEqual([])
      },
      () =>
        makeHarness(
          stubClient({
            startRun: async () =>
              streamOf([
                { type: 'run-accepted', runToken: 'tok' },
                { type: 'run-failed', error: { _tag: null, message: 'Internal server error' } },
              ]),
          }),
        ),
    )
  })

  it('drops the duration of a failed row rather than synthesising one', async () => {
    await inFrame(
      async ({ model }) => {
        await wrap(model.start({ title: 't' }))

        expect(model.history()).toEqual([{ id: '220', label: '#220', status: 'failed' }])
      },
      () => makeHarness(settling(SECOND_REPORT)),
    )
  })

  it('marks the newest run until a row is picked, and the picked row after', async () => {
    await inFrame(
      async ({ model }) => {
        await wrap(model.start({ title: 't' }))
        expect(model.activeRunId()).toBe('219')
        expect(model.selectedRunId()).toBeUndefined()

        model.selectRun('219')
        expect(model.activeRunId()).toBe('219')
        expect(model.selectedRunId()).toBe('219')
      },
      () => makeHarness(settling(REPORT)),
    )
  })

  // A live run owns the canvas and is the one run with no row of its own, so a row must not take
  // over mid-flight — and a new start drops the pick for the same reason.
  it('shows the picked run only while nothing is in flight, and a start drops the pick', async () => {
    const streamGate = gate()
    await inFrame(
      async ({ model, descriptor }) => {
        await wrap(model.start({ title: 't' }))
        expect(model.viewedSession()?.report?.runNumber).toBe(219)

        model.selectRun('219')
        expect(model.viewedReport()?.runNumber).toBe(219)

        // A second run, gated open: the pick is dropped and the live session is what is viewed.
        descriptor.set(DESCRIPTOR)
        const pending = model.start({ title: 't' })
        expect(model.selectedRunId()).toBeUndefined()
        expect(model.viewedSession()?.report).toBeUndefined()

        streamGate.release()
        await wrap(pending)
      },
      () => {
        let first = true
        return makeHarness(
          stubClient({
            startRun: async () => {
              if (first) {
                first = false
                return streamOf([
                  { type: 'run-accepted', runToken: 'tok' },
                  { type: 'run-settled', report: REPORT },
                ])
              }
              return (async function* () {
                yield { type: 'run-accepted', runToken: 'tok-2' } as RunStreamEvent
                await streamGate.promise
              })()
            },
          }),
        )
      },
    )
  })

  // F07 — whether the settled run on screen is still a report about the start the panel is pointed
  // at. A row picked from `Run history` is the deliberate exception.
  it('stops calling a settled run current once the panel moves to another start', async () => {
    await inFrame(
      async ({ model, startId }) => {
        await wrap(model.start({ in: 'pikachu' }))
        expect(model.settledRunIsCurrent()).toBe(true)

        startId.set('roster')
        expect(model.settledRunIsCurrent()).toBe(false)

        model.selectRun('221')
        expect(model.settledRunIsCurrent()).toBe(true)
      },
      () =>
        makeHarness(
          stubClient({
            startRun: async () =>
              streamOf([
                { type: 'run-accepted', runToken: 'tok' },
                { type: 'run-settled', report: CARD_REPORT },
              ]),
          }),
          {
            flowId: 'pokedex',
            descriptor: PIPELINES_DESCRIPTOR,
            document: PIPELINES_DOCUMENT,
            startId: 'card',
          },
        ),
    )
  })

  it('ends the run on a reset without destroying the runs the flow has made', async () => {
    await inFrame(
      async ({ model }) => {
        await wrap(model.start({ title: 't' }))
        expect(model.history()).toHaveLength(1)

        model.reset()

        expect(model.selectedRunId()).toBeUndefined()
        expect(model.runToken()).toBeUndefined()
        expect(model.session()).toBeUndefined()
        expect(model.running()).toBe(false)
        expect(model.cancelPrompt()).toBe(false)
        // The reset ends the run; the flow's own record of what it has run is not the run.
        expect(model.history()).toHaveLength(1)
      },
      () => makeHarness(settling(REPORT)),
    )
  })

  /**
   * R1. The archive is keyed by flow, so the switch that hides a flow's rows is the same move that
   * brings them back — and no row of one flow is ever listed under another's name.
   */
  it('lists another flow no runs, and gives the first one its runs back on return', async () => {
    await inFrame(
      async ({ model, flowId }) => {
        await wrap(model.start({ title: 't' }))
        expect(model.history()).toHaveLength(1)

        // One flow switch, in `commitSwitch`'s own order: every reset, then the id moves.
        model.reset()
        flowId.set('pokedex')

        expect(model.archive()).toEqual([])
        expect(model.history()).toEqual([])

        model.reset()
        flowId.set('publication')

        expect(model.history()).toEqual([
          { id: '219', label: '#219', status: 'ok', elapsed: '2.4s' },
        ])
        // Nothing is on the surfaces, so no row claims to be what is shown — until one is picked,
        // and then it restores the run it names.
        expect(model.activeRunId()).toBeUndefined()
        model.selectRun('219')
        expect(model.activeRunId()).toBe('219')
        expect(model.viewedSession()?.report?.runNumber).toBe(219)
      },
      () => makeHarness(settling(REPORT)),
    )
  })
})

describe('starting from the input draft', () => {
  it('runs with what the draft holds, and reports nothing when it holds nothing valid', async () => {
    const startRun = vi.fn(async () => streamOf([{ type: 'run-accepted' as const, runToken: 't' }]))
    await inFrame(
      async ({ model, draftValues }) => {
        model.runFromDraft()
        await flush()
        expect(startRun).toHaveBeenCalledWith({
          flowId: 'publication',
          startId: 'start1',
          input: { title: 't' },
        })

        // F02: the draft no longer satisfies the schema, so `inputValues` files the finding and
        // answers `undefined`; nothing starts and nothing is fabricated.
        draftValues.set(undefined)
        model.runFromDraft()
        await flush()
        expect(startRun).toHaveBeenCalledTimes(1)
      },
      () => makeHarness(stubClient({ startRun })),
    )
  })

  // `3D`: *"Run is disabled while any error stands"* — the guard behind every affordance, not only
  // the ones whose chrome looks blocked.
  it('refuses to start while the flow has an error standing', async () => {
    const startRun = vi.fn(async () => streamOf([{ type: 'run-accepted' as const, runToken: 't' }]))
    await inFrame(
      async ({ model, blocked }) => {
        blocked.set(true)
        await wrap(model.start({ title: 't' }))
        model.runFromDraft()
        await flush()

        expect(startRun).not.toHaveBeenCalled()
        expect(model.running()).toBe(false)
        expect(model.session()).toBeUndefined()
      },
      () => makeHarness(stubClient({ startRun })),
    )
  })

  it('clears the last press’s findings when a run does start', async () => {
    await inFrame(
      async ({ model, inputIssues }) => {
        inputIssues.set([{ path: 'title', message: 'Required' }])

        await wrap(model.start({ title: 't' }))

        expect(inputIssues()).toBeUndefined()
      },
      () => makeHarness(stubClient()),
    )
  })
})

describe('`3B` retry and `3C` cancel', () => {
  const streamGate = gate()

  it('starts exactly the run Re-run starts, and records which card asked', async () => {
    const startRun = vi.fn(async () =>
      (async function* () {
        yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
        await streamGate.promise
      })(),
    )
    await inFrame(
      async ({ model }) => {
        model.retryNode({ nodeId: 'lookup', errorName: 'NodeHandlerError', message: 'nope' })
        expect(startRun).toHaveBeenCalledTimes(1)
        expect(model.retry()).toEqual({
          nodeId: 'lookup',
          errorName: 'NodeHandlerError',
          message: 'nope',
        })

        // The retry is over with the run that carried it: past that the node's own settled state is
        // the truth and `3B` has nothing left to say.
        streamGate.release()
        await flush()
        expect(model.running()).toBe(false)
        expect(model.retry()).toBeUndefined()
      },
      () => makeHarness(stubClient({ startRun })),
    )
  })

  it('leaves no card claiming a run when the press could not start one', async () => {
    const startRun = vi.fn(async () => streamOf([{ type: 'run-accepted' as const, runToken: 't' }]))
    await inFrame(
      async ({ model, blocked }) => {
        blocked.set(true)
        model.retryNode({ nodeId: 'lookup', errorName: 'NodeHandlerError', message: 'nope' })
        await flush()

        expect(startRun).not.toHaveBeenCalled()
        expect(model.retry()).toBeUndefined()
      },
      () => makeHarness(stubClient({ startRun })),
    )
  })

  // `3C`: every affordance opens the dialog; only its primary cancels.
  it('asks before cancelling, and only the primary sends the request', async () => {
    const cancelGate = gate()
    const cancelRun = vi.fn(async () => true as const)
    await inFrame(
      async ({ model }) => {
        const pending = model.start({ title: 't' })
        await flush()

        model.askToCancel()
        expect(model.cancelPrompt()).toBe(true)
        expect(cancelRun).not.toHaveBeenCalled()

        model.keepRunning()
        expect(model.cancelPrompt()).toBe(false)
        expect(cancelRun).not.toHaveBeenCalled()

        model.askToCancel()
        model.confirmCancel()
        await flush()
        expect(model.cancelPrompt()).toBe(false)
        expect(cancelRun).toHaveBeenCalledWith('tok-9')
        expect(model.session()?.cancelling).toBe(true)

        cancelGate.release()
        await wrap(pending)
      },
      () =>
        makeHarness(
          stubClient({
            cancelRun,
            startRun: async () =>
              (async function* () {
                yield { type: 'run-accepted', runToken: 'tok-9' } as RunStreamEvent
                await cancelGate.promise
              })(),
          }),
        ),
    )
  })

  // The node the `Cancel run` dialog names twice. The stream reports at most one at a time.
  it('names the node still working, and nothing once the run has none', async () => {
    const settleGate = gate()
    await inFrame(
      async ({ model }) => {
        const pending = model.start({ in: 'pikachu' })
        await flush()

        expect(model.runningNodeId()).toBe('lookup')

        settleGate.release()
        await wrap(pending)
        expect(model.runningNodeId()).toBeUndefined()
      },
      () =>
        makeHarness(
          stubClient({
            startRun: async () =>
              (async function* () {
                yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
                yield {
                  type: 'node-status',
                  nodeId: 'lookup',
                  status: 'running',
                  elapsedMs: 5,
                  error: null,
                } as RunStreamEvent
                await settleGate.promise
                yield { type: 'run-settled', report: CARD_REPORT } as RunStreamEvent
              })(),
          }),
          {
            flowId: 'pokedex',
            descriptor: PIPELINES_DESCRIPTOR,
            document: PIPELINES_DOCUMENT,
            startId: 'card',
          },
        ),
    )
  })
})

/**
 * RTM-S03/RTM-S07 — the reason this module exists in Reatom rather than in React.
 *
 * The hook replaced one `session` object per stream line and every card read it, so a seven-node
 * canvas repainted on every `node-status`. `reatomRunNodes` derives one model per node id and caches
 * it, and `applyRunEvent` leaves every untouched `NodeRunRecord` at its original identity — so a
 * line about one node changes one node's atoms and notifies one node's subscribers.
 */
describe('per-node run state', () => {
  it('changes exactly one node’s atoms on a node-status line', async () => {
    const first = gate()
    const second = gate()
    await inFrame(
      async ({ model }) => {
        const nodes = reatomRunNodes(model.session, 'probe')
        const pending = model.start({ in: 'pikachu' })
        await flush()

        const seen: Record<string, number> = {}
        const stop = ['card', 'lookup', 'sprite', 'compose'].map((nodeId) => {
          seen[nodeId] = 0
          return nodes.get(nodeId).record.subscribe(() => {
            seen[nodeId] = (seen[nodeId] ?? 0) + 1
          })
        })
        // Every subscriber has been called once with the seeded record.
        expect(seen).toEqual({ card: 1, lookup: 1, sprite: 1, compose: 1 })

        first.release()
        await flush()
        expect(seen).toEqual({ card: 1, lookup: 2, sprite: 1, compose: 1 })
        expect(nodes.get('lookup').status()).toBe('running')
        expect(nodes.get('lookup').elapsedMs()).toBe(5)
        expect(nodes.get('sprite').status()).toBe('queued')

        // A log line touches the session and no node at all.
        second.release()
        await flush()
        expect(seen).toEqual({ card: 1, lookup: 2, sprite: 1, compose: 1 })

        for (const unsubscribe of stop) unsubscribe()
        await wrap(pending)
      },
      () =>
        makeHarness(
          stubClient({
            startRun: async () =>
              (async function* () {
                yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
                await first.promise
                yield {
                  type: 'node-status',
                  nodeId: 'lookup',
                  status: 'running',
                  elapsedMs: 5,
                  error: null,
                } as RunStreamEvent
                await second.promise
                yield {
                  type: 'node-log',
                  line: { nodeId: 'lookup', message: 'asking pokeapi', at: 1010 },
                } as RunStreamEvent
              })(),
          }),
          {
            flowId: 'pokedex',
            descriptor: PIPELINES_DESCRIPTOR,
            document: PIPELINES_DOCUMENT,
            startId: 'card',
          },
        ),
    )
  })

  // Without the cache the factory would be called again on every recomputation and hand out a fresh
  // model per stream line — the models would forget everything, which is the failure RTM-S07 names.
  it('hands out one model instance per node id, however often the collection recomputes', async () => {
    await inFrame(
      async ({ model }) => {
        const nodes = reatomRunNodes(model.session, 'probe')
        await wrap(model.start({ in: 'pikachu' }))

        const before = nodes.list()
        const lookup = nodes.get('lookup')
        expect(before.map((node) => node.nodeId)).toEqual(['card', 'lookup', 'sprite', 'compose'])
        expect(before.find((node) => node.nodeId === 'lookup')).toBe(lookup)

        // A second run rebuilds the session from scratch; the models survive it.
        await wrap(model.start({ in: 'pikachu' }))
        expect(nodes.get('lookup')).toBe(lookup)
        expect(nodes.list().find((node) => node.nodeId === 'lookup')).toBe(lookup)
      },
      () =>
        makeHarness(stubClient(), {
          flowId: 'pokedex',
          descriptor: PIPELINES_DESCRIPTOR,
          document: PIPELINES_DOCUMENT,
          startId: 'card',
        }),
    )
  })
})

/**
 * The clock, and the separation Wave 2 depends on: `elapsedMs` is its own unit, so a tick
 * invalidates neither the run log nor any node's timing. The loop behind it is
 * `await wrap(sleep(TICK_MS))` owned by a connect hook (RTM-A05, RTM-L01) — there is no interval
 * handle to leak, and it stops when nothing is reading the clock.
 */
describe('the elapsed clock', () => {
  it('counts up while a run is in flight and holds the settled time afterwards', async () => {
    const streamGate = gate()
    await inFrame(
      async ({ model, clock }) => {
        expect(model.elapsedMs()).toBe(0)

        const pending = model.start({ title: 't' })
        clock.value = 1350
        expect(model.elapsedMs()).toBe(350)

        streamGate.release()
        await wrap(pending)
        // The settled run's own number, not the clock's.
        clock.value = 99_999
        expect(model.elapsedMs()).toBe(2400)
      },
      () =>
        makeHarness(
          stubClient({
            startRun: async () =>
              (async function* () {
                yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
                await streamGate.promise
                yield { type: 'run-settled', report: REPORT } as RunStreamEvent
              })(),
          }),
        ),
    )
  })

  it('ticks while something reads it and stops when nothing does', async () => {
    const streamGate = gate()
    await inFrame(
      async ({ model, clock }) => {
        const pending = model.start({ title: 't' })
        const seen: number[] = []
        const unsubscribe = model.elapsedMs.subscribe((value) => seen.push(value))
        expect(seen).toEqual([0])

        clock.value = 1350
        await wrap(sleep(260))
        expect(seen.at(-1)).toBe(350)
        const whileConnected = seen.length
        expect(whileConnected).toBeGreaterThan(1)

        unsubscribe()
        clock.value = 9000
        await wrap(sleep(260))
        expect(seen.length).toBe(whileConnected)

        streamGate.release()
        await wrap(pending)
      },
      () =>
        makeHarness(
          stubClient({
            startRun: async () =>
              (async function* () {
                yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
                await streamGate.promise
                yield { type: 'run-settled', report: REPORT } as RunStreamEvent
              })(),
          }),
        ),
    )
  })

  it('does not invalidate the run log or a node timing when it ticks', async () => {
    const streamGate = gate()
    await inFrame(
      async ({ model, clock }) => {
        const pending = model.start({ in: 'pikachu' })
        await flush()

        let sessions = 0
        let lookups = 0
        const nodes = reatomRunNodes(model.session, 'probe')
        const stopSession = model.session.subscribe(() => {
          sessions += 1
        })
        const stopLookup = nodes.get('lookup').record.subscribe(() => {
          lookups += 1
        })
        const stopClock = model.elapsedMs.subscribe(() => {})
        expect(sessions).toBe(1)
        expect(lookups).toBe(1)

        clock.value = 1500
        await wrap(sleep(260))

        // The clock advanced several times; neither the session nor the node heard about it.
        expect(model.elapsedMs()).toBe(500)
        expect(sessions).toBe(1)
        expect(lookups).toBe(1)

        stopClock()
        stopLookup()
        stopSession()
        streamGate.release()
        await wrap(pending)
      },
      () =>
        makeHarness(
          stubClient({
            startRun: async () =>
              (async function* () {
                yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
                await streamGate.promise
                yield { type: 'run-settled', report: CARD_REPORT } as RunStreamEvent
              })(),
          }),
          {
            flowId: 'pokedex',
            descriptor: PIPELINES_DESCRIPTOR,
            document: PIPELINES_DOCUMENT,
            startId: 'card',
          },
        ),
    )
  })
})

describe('file-backed history', () => {
  const saved = (runId: string, flowId = 'publication') => ({
    schemaVersion: 1 as const,
    runId,
    flowId,
    startId: 'start1',
    createdAt: 1000,
    updatedAt: 3400,
    status: 'ok' as const,
    runNumber: 219,
    input: { title: 'original paid input' },
    document: DOCUMENT,
    revision: 'saved-revision',
    report: {
      ...REPORT,
      runId,
      nodes: REPORT.nodes.map((node) => ({ ...node, output: { title: runId } })),
    },
    events: [],
    failure: null,
  })

  it('loads stable UUID history and original results without running or mutating the current draft', async () => {
    const startRun = vi.fn()
    const getRun = vi.fn(async ({ runId }: { runId: string }) => saved(runId))
    await inFrame(
      async ({ model, draftValues }) => {
        const stop = model.history.subscribe(() => {})
        await flush()
        expect(model.history().map((run) => run.id)).toEqual(['uuid-new', 'uuid-old'])
        model.selectRun('uuid-old')
        const stopView = model.viewedSession.subscribe(() => {})
        await flush()
        expect(model.activeRunId()).toBe('uuid-old')
        expect(model.viewedReport()?.nodes[0]?.output).toEqual({ title: 'uuid-old' })
        expect(model.viewedSession()?.persisted?.input).toEqual({ title: 'original paid input' })
        expect(draftValues()).toEqual({ title: 't' })
        expect(getRun).toHaveBeenCalledWith({ flowId: 'publication', runId: 'uuid-old' })
        expect(startRun).not.toHaveBeenCalled()
        stopView()
        stop()
      },
      () =>
        makeHarness(
          stubClient({
            listRuns: async () => [saved('uuid-new'), saved('uuid-old')],
            getRun,
            startRun,
          }),
        ),
    )
  })

  it('keeps selected archived output stable when its late listing lands and drops another flow response', async () => {
    const oldDetail = gate()
    const newList = gate()
    await inFrame(
      async ({ model, flowId }) => {
        const stop = model.history.subscribe(() => {})
        model.selectRun('old-uuid')
        const stopView = model.viewedSession.subscribe(() => {})
        await flush()
        model.reset()
        flowId.set('other')
        model.selectRun('new-uuid')
        await flush()
        expect(model.viewedReport()?.nodes[0]?.output).toEqual({ title: 'new-uuid' })
        newList.release()
        oldDetail.release()
        await flush()
        expect(model.history().map((run) => run.id)).toEqual(['new-uuid'])
        expect(model.activeRunId()).toBe('new-uuid')
        expect(model.viewedReport()?.nodes[0]?.output).toEqual({ title: 'new-uuid' })
        stopView()
        stop()
      },
      () =>
        makeHarness(
          stubClient({
            listRuns: async (flowId) => {
              if (flowId === 'other') await newList.promise
              return [saved(flowId === 'other' ? 'new-uuid' : 'old-uuid', flowId)]
            },
            getRun: async ({ flowId, runId }) => {
              if (runId === 'old-uuid') await oldDetail.promise
              return saved(runId, flowId)
            },
          }),
        ),
    )
  })

  it('restores interrupted partial outputs and surfaces archive read failures instead of a previous success', async () => {
    await inFrame(
      async ({ model }) => {
        model.selectRun('interrupted')
        const stop = model.viewedSession.subscribe(() => {})
        await flush()
        expect(model.viewedSession()?.nodeReports?.get('start1')?.output).toEqual({ title: 't' })
        expect(model.viewedSession()?.failure?.message).toMatch(/interrupted/i)
        model.selectRun('missing')
        expect(model.viewedReport()).toBeUndefined()
        await flush()
        expect(model.viewedSession()?.failure?.message).toBe('Archive read failed')
        stop()
      },
      () =>
        makeHarness(
          stubClient({
            getRun: async ({ runId }) =>
              runId === 'missing'
                ? new Error('Archive read failed')
                : {
                    ...saved(runId),
                    report: null,
                    status: 'interrupted',
                    events: [
                      {
                        type: 'run-started',
                        runNumber: 219,
                        flowName: 'publication',
                        startId: 'start1',
                        nodeCount: 1,
                      },
                      {
                        type: 'node-settled',
                        runNumber: 219,
                        node: { ...reportNode('start1', 'ok'), output: { title: 't' } },
                      },
                    ],
                  },
          }),
        ),
    )
  })
})

it('refreshes saved history after an accepted execution fails before producing a report', async () => {
  let failed = false
  const startRun = vi.fn(async () =>
    (async function* () {
      yield { type: 'run-accepted', runId: 'failed-uuid', runToken: 'token' } as const
      failed = true
      yield {
        type: 'run-failed',
        error: { _tag: 'RunInputError', message: 'Rejected input' },
      } as const
    })(),
  )
  await inFrame(
    async ({ model }) => {
      const stop = model.history.subscribe(() => {})
      await flush()
      expect(model.history()).toEqual([])
      await wrap(model.start({ title: 'input' }))
      await flush()
      expect(model.history()).toEqual([
        {
          id: 'failed-uuid',
          label: 'failed-u',
          status: 'failed',
        },
      ])
      expect(model.historyMessage()).toBeUndefined()
      expect(startRun).toHaveBeenCalledTimes(1)
      stop()
    },
    () =>
      makeHarness(
        stubClient({
          startRun,
          listRuns: async () =>
            failed
              ? [
                  {
                    runId: 'failed-uuid',
                    flowId: 'publication',
                    startId: 'start1',
                    createdAt: 1,
                    updatedAt: 2,
                    status: 'failed',
                    runNumber: null,
                  },
                ]
              : [],
        }),
      ),
  )
})

it('never retries archived failures against hidden current inputs', async () => {
  const startRun = vi.fn(async () => streamOf([]))
  await inFrame(
    async ({ model }) => {
      model.selectRun('saved-failure')
      model.retryNode({ nodeId: 'render', errorName: 'OldError', message: 'old run' })
      await flush()
      expect(startRun).not.toHaveBeenCalled()
    },
    () => makeHarness(stubClient({ startRun })),
  )
})
