import type { FlowDocument } from '@jobik/core'
import { context, wrap } from '@reatom/core'
import { describe, expect, it, vi } from 'vitest'
import type { JobikClient, LoadedFlowPayload } from '#client/index.js'
import { JobikTransportError } from '#client/index.js'
import { reatomFlows } from './flows.js'
import type { FlowsModel, StudioDeps } from './types.js'

/**
 * `model/flows.ts`, driven directly inside a `context.start()` frame rather than through
 * `renderHook`.
 *
 * Every case here was ported from `studio/useStudioSession.test.ts`, now deleted, and keeps the
 * name it had there so the port stays auditable. Where a case asserted on state this module
 * does not own — the draft, the save state, the run input draft — that assertion moves to the model
 * that owns it; each such split is named in the case's own comment rather than dropped silently.
 *
 * **Two rules make a Reatom model testable this way, and both are easy to get wrong.**
 *
 * `await` inside `context.start(async () => …)` leaves the frame. Every one of them is
 * `await wrap(…)`, including the awaits on the helpers below: a bare `await` resumes in the global
 * context, where none of these atoms have any state at all, and the reads that follow silently
 * answer `undefined`.
 *
 * A Reatom computed is pull-based, so nothing recomputes on its own until something is connected to
 * it. {@link connect} subscribes to the two units a mounted Studio subscribes to, which is what
 * makes an async computed fire and settle without anyone reading it.
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
}

const POKEDEX_DOCUMENT = {
  format: 'jobik.flow',
  version: 1,
  connections: [],
  literals: {},
  layout: { byName: { x: 0, y: 0 } },
} as unknown as FlowDocument

const POKEDEX_DESCRIPTOR = {
  ...DESCRIPTOR,
  id: 'pokedex',
  name: 'pokedex',
  startIds: ['byName'],
  nodes: [{ ...DESCRIPTOR.nodes[0], id: 'byName' }],
}

function stubClient(overrides: Partial<JobikClient> = {}): JobikClient {
  return {
    listFlows: async () => [{ id: 'publication', name: 'publication', nodeCount: 1 }],
    loadFlow: async () => ({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: 'rev-1' }),
    validate: async () => ({ valid: true }),
    save: async () => ({ revision: 'rev-2' }),
    startRun: async () => new JobikTransportError({ url: '/api/runs' }),
    cancelRun: async () => true,
    assetUrl: (descriptor) => `/api/assets/${descriptor.id}`,
    extensionBundleUrl: () => '/api/flows/publication/ui.js',
    ...overrides,
  }
}

/** Two flows behind one client, each answering with its own descriptor and document. */
function twoFlowClient(overrides: Partial<JobikClient> = {}): JobikClient {
  return stubClient({
    listFlows: async () => [
      { id: 'publication', name: 'publication', nodeCount: 1 },
      { id: 'pokedex', name: 'pokedex', nodeCount: 2 },
    ],
    loadFlow: async (id: string) =>
      id === 'pokedex'
        ? { descriptor: POKEDEX_DESCRIPTOR, document: POKEDEX_DOCUMENT, revision: 'rev-p1' }
        : { descriptor: DESCRIPTOR, document: DOCUMENT, revision: 'rev-1' },
    ...overrides,
  })
}

function deps(client: JobikClient): StudioDeps {
  return { client, now: () => 1000 }
}

/**
 * What a mounted Studio subscribes to. Without a connection nothing recomputes on its own, so the
 * async computeds would only ever advance on a read — which is not how the app behaves and not what
 * the ported cases assert.
 */
function connect(model: FlowsModel): () => void {
  const unsubscribe = [model.flows.subscribe(() => {}), model.descriptor.subscribe(() => {})]
  return () => {
    for (const off of unsubscribe) off()
  }
}

const macrotask = () => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * Drives the frame until `predicate` holds. Call it as `await wrap(until(…))` — the `wrap` is what
 * puts the *caller's* continuation back in the frame.
 */
async function until(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return
    await wrap(macrotask())
  }
  throw new Error(`timed out waiting for ${label}`)
}

/** The load having landed, as this module can see it: `undefined` until a payload is in. */
function revisionOf(model: FlowsModel): string | undefined {
  const payload = model.loaded.data()
  return payload === undefined || payload instanceof Error ? undefined : payload.revision
}

describe('loading', () => {
  /**
   * `draft?.baseRevision` and `draft?.dirty` are `DraftModel`'s and are asserted in
   * `model/draft.test.ts`; the revision the draft is seeded *from* is this module's and is asserted
   * here.
   */
  it('lists flows and loads the first one into a clean draft', async () => {
    await context.start(async () => {
      const model = reatomFlows(deps(stubClient()), 'studio.flows')
      const off = connect(model)

      await wrap(until(() => model.descriptor() !== undefined, 'the first flow to load'))

      expect(model.flowId()).toBe('publication')
      expect(model.descriptor()?.name).toBe('publication')
      expect(model.flows()).toHaveLength(1)
      expect(revisionOf(model)).toBe('rev-1')
      off()
    })
  })

  // R5: discovery and load are two units, not one. A single unit that read `flowId`, set it and
  // listed `flowId` among its own dependencies double-fired on mount. This asserts the shape that
  // fixed it does not regress.
  it('discovers the flow list and loads the selected flow exactly once each', async () => {
    const listFlows = vi.fn(async () => [{ id: 'publication', name: 'publication', nodeCount: 1 }])
    const loadFlow = vi.fn(async () => ({
      descriptor: DESCRIPTOR,
      document: DOCUMENT,
      revision: 'rev-1',
    }))

    await context.start(async () => {
      const model = reatomFlows(deps(stubClient({ listFlows, loadFlow })), 'studio.flows')
      const off = connect(model)

      await wrap(until(() => model.descriptor() !== undefined, 'the first flow to load'))

      expect(listFlows).toHaveBeenCalledTimes(1)
      expect(loadFlow).toHaveBeenCalledTimes(1)
      off()
    })
  })

  /**
   * `listFlows` follows the `T | Error` contract and never rejects, so a transport failure is a
   * value in `.data()`. The sidebar draws a listing, never an error, so `flows` answers with an
   * empty one — and, with no id to seed, nothing is fetched.
   */
  it('draws no listing and loads nothing when discovery fails', async () => {
    const loadFlow = vi.fn(async () => ({
      descriptor: DESCRIPTOR,
      document: DOCUMENT,
      revision: 'rev-1',
    }))
    const client = stubClient({
      listFlows: async () => new JobikTransportError({ url: '/api/flows' }),
      loadFlow,
    })

    await context.start(async () => {
      const model = reatomFlows(deps(client), 'studio.flows')
      const off = connect(model)

      await wrap(until(() => model.list.data() !== undefined, 'the listing to answer'))

      expect(model.flows()).toEqual([])
      expect(model.flowId()).toBeUndefined()
      expect(model.descriptor()).toBeUndefined()
      expect(loadFlow).not.toHaveBeenCalled()
      off()
    })
  })
})

describe('reloading from disk', () => {
  /**
   * The draft this discards and the `saveState` it clears are `DraftModel`'s and `SaveModel`'s, and
   * are asserted in their own files. What this module owns is the second fetch and the payload it
   * lands.
   */
  it('reloads from disk and discards the draft', async () => {
    const loadFlow = vi
      .fn()
      .mockResolvedValueOnce({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: 'rev-1' })
      .mockResolvedValueOnce({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: 'rev-9' })

    await context.start(async () => {
      const model = reatomFlows(deps(stubClient({ loadFlow })), 'studio.flows')
      const off = connect(model)
      await wrap(until(() => revisionOf(model) === 'rev-1', 'the mount load'))

      model.reloadFromDisk()

      await wrap(until(() => revisionOf(model) === 'rev-9', 'the reload'))
      expect(loadFlow).toHaveBeenCalledTimes(2)
      expect(model.descriptor()?.id).toBe('publication')
      off()
    })
  })

  // Minor: `reloadFromDisk()` and the mount load both write the same payload, and without a guard
  // whichever response lands last wins regardless of which was actually fresher. Here the mount
  // load is held open; the reload resolves first with `rev-9`, and the mount load's late, now-stale
  // `rev-1` must not land on top of it. The hook counted generations by hand; `withAsyncData`
  // carries `withAbort`, which supersedes the open computation instead.
  it('does not let a slow mount-load response overwrite a faster reloadFromDisk response', async () => {
    let resolveMountLoad: (value: LoadedFlowPayload) => void = () => {}
    const mountLoadGate = new Promise<LoadedFlowPayload>((resolve) => {
      resolveMountLoad = resolve
    })
    const loadFlow = vi
      .fn()
      .mockImplementationOnce(() => mountLoadGate)
      .mockResolvedValueOnce({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: 'rev-9' })

    await context.start(async () => {
      const model = reatomFlows(deps(stubClient({ loadFlow })), 'studio.flows')
      const off = connect(model)
      await wrap(until(() => loadFlow.mock.calls.length === 1, 'the mount load to be issued'))

      model.reloadFromDisk()

      await wrap(until(() => revisionOf(model) === 'rev-9', 'the reload'))
      resolveMountLoad({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: 'rev-1' })
      await wrap(macrotask())
      await wrap(macrotask())

      expect(revisionOf(model)).toBe('rev-9')
      off()
    })
  })

  it('asks for nothing while no flow is selected', async () => {
    const loadFlow = vi.fn(async () => ({
      descriptor: DESCRIPTOR,
      document: DOCUMENT,
      revision: 'rev-1',
    }))
    const client = stubClient({ listFlows: async () => [], loadFlow })

    await context.start(async () => {
      const model = reatomFlows(deps(client), 'studio.flows')
      const off = connect(model)
      await wrap(until(() => model.list.data() !== undefined, 'the listing to answer'))

      model.reloadFromDisk()
      await wrap(macrotask())

      expect(loadFlow).not.toHaveBeenCalled()
      off()
    })
  })
})

describe('switching flows', () => {
  /**
   * `draft?.baseRevision` and `startId` are `DraftModel`'s and `InputsModel`'s; the revision the
   * draft is seeded from is asserted here in their place.
   */
  it('loads the flow it is pointed at', async () => {
    await context.start(async () => {
      const model = reatomFlows(deps(twoFlowClient()), 'studio.flows')
      const off = connect(model)
      await wrap(until(() => model.descriptor() !== undefined, 'the first flow'))
      expect(model.descriptor()?.id).toBe('publication')

      model.selectFlow('pokedex')

      await wrap(until(() => model.descriptor()?.id === 'pokedex', 'the second flow'))
      expect(model.flowId()).toBe('pokedex')
      expect(revisionOf(model)).toBe('rev-p1')
      off()
    })
  })

  /**
   * The flows-owned half of the whole reset. The other eleven pieces the hook cleared by hand are
   * each a sub-model's `reset` now and are asserted in those models' own files and in
   * `model/flowSwitch.test.ts`; the piece this module owns is the descriptor, which must be gone on
   * the frame the switch commits rather than when the new flow's fetch resolves — the exact window
   * in which the old flow renders under the new flow's id.
   *
   * `withAsyncData` keeps the last successful payload while the next request is in flight, so this
   * is not free: `descriptor` is withheld until the payload is about the flow now selected.
   */
  it('clears every piece of the previous flow before the new one lands', async () => {
    await context.start(async () => {
      const model = reatomFlows(deps(twoFlowClient()), 'studio.flows')
      const off = connect(model)
      await wrap(until(() => model.descriptor() !== undefined, 'the first flow'))

      model.selectFlow('pokedex')

      expect(model.flowId()).toBe('pokedex')
      expect(model.descriptor()).toBeUndefined()
      off()
    })
  })

  it('does not let the previous flow’s load land on the flow that replaced it', async () => {
    let resolveFirst: (value: LoadedFlowPayload) => void = () => {}
    const firstGate = new Promise<LoadedFlowPayload>((resolve) => {
      resolveFirst = resolve
    })
    const loadFlow = vi.fn(async (id: string) =>
      id === 'pokedex'
        ? { descriptor: POKEDEX_DESCRIPTOR, document: POKEDEX_DOCUMENT, revision: 'rev-p1' }
        : firstGate,
    )

    await context.start(async () => {
      const model = reatomFlows(deps(twoFlowClient({ loadFlow })), 'studio.flows')
      const off = connect(model)
      await wrap(until(() => loadFlow.mock.calls.length === 1, 'the first load to be issued'))

      model.selectFlow('pokedex')
      await wrap(until(() => model.descriptor()?.id === 'pokedex', 'the second flow'))

      resolveFirst({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: 'rev-1' })
      await wrap(macrotask())
      await wrap(macrotask())

      expect(model.descriptor()?.id).toBe('pokedex')
      expect(revisionOf(model)).toBe('rev-p1')
      off()
    })
  })

  /** The guard is the reason this is an action and not a bare `flowId.set` at the call site. */
  it('is not a transition when the flow is already the one open', async () => {
    const loadFlow = vi.fn(async () => ({
      descriptor: DESCRIPTOR,
      document: DOCUMENT,
      revision: 'rev-1',
    }))

    await context.start(async () => {
      const model = reatomFlows(deps(stubClient({ loadFlow })), 'studio.flows')
      const off = connect(model)
      await wrap(until(() => model.descriptor() !== undefined, 'the first flow'))

      model.selectFlow('publication')
      await wrap(macrotask())

      expect(loadFlow).toHaveBeenCalledTimes(1)
      expect(model.descriptor()?.id).toBe('publication')
      off()
    })
  })
})
