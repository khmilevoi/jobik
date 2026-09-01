import { atom, context, wrap } from '@reatom/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JobikClient } from '#client/index.js'
import { JobikTransportError } from '#client/index.js'
import { reatomExtension } from './extension.js'
import type { ExtensionModel, StudioDeps } from './types.js'

/**
 * `model/extension.ts`, driven directly inside a `context.start()` frame.
 *
 * The same two rules as `flows.test.ts` apply and are load-bearing: every `await` inside the frame
 * is `await wrap(…)`, and {@link connect} subscribes so the async computed advances on its own
 * rather than only when something reads it.
 *
 * `studio/extensionLoader.ts` is not re-tested here — `studio/extensionLoader.test.ts` owns the
 * fetch-rewrite-evaluate path. What these cases are about is *when* the bundle is asked for, which
 * is the whole of what moved.
 */

/** The smallest thing `isFlowUiDescriptor` accepts: a descriptor that registers no node. */
const DESCRIPTOR = { nodes: {} }

function stubClient(overrides: Partial<JobikClient> = {}): JobikClient {
  return {
    listFlows: async () => [],
    loadFlow: async () => new JobikTransportError({ url: '/api/flows/x' }),
    validate: async () => ({ valid: true }),
    save: async () => ({ revision: 'rev-2' }),
    startRun: async () => new JobikTransportError({ url: '/api/runs' }),
    cancelRun: async () => true,
    assetUrl: (descriptor) => `/api/assets/${descriptor.id}`,
    extensionBundleUrl: (flowId) => `/api/flows/${flowId}/ui.js`,
    ...overrides,
  }
}

function servedBundle() {
  return vi.fn(
    async () => ({ ok: true, text: async () => 'export default {}' }) as unknown as Response,
  )
}

function deps(overrides: Partial<StudioDeps> = {}): StudioDeps {
  return {
    client: stubClient(),
    externals: {},
    importModule: async () => ({ default: DESCRIPTOR }),
    now: () => 1000,
    ...overrides,
  }
}

function connect(model: ExtensionModel): () => void {
  return model.descriptor.subscribe(() => {})
}

const macrotask = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Call it as `await wrap(until(…))` — the `wrap` is what puts the caller back in the frame. */
async function until(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return
    await wrap(macrotask())
  }
  throw new Error(`timed out waiting for ${label}`)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('extension bundle', () => {
  it('loads the flow-local renderer for the flow it is pointed at', async () => {
    const fetchSpy = servedBundle()
    vi.stubGlobal('fetch', fetchSpy)

    await context.start(async () => {
      const flowId = atom<string | undefined>('publication', 'studio.flows.flowId')
      const model = reatomExtension(deps(), { flowId }, 'studio.extension')
      const off = connect(model)

      await wrap(until(() => model.descriptor() !== undefined, 'the bundle'))

      expect(model.descriptor()).toEqual(DESCRIPTOR)
      expect(fetchSpy).toHaveBeenCalledWith('/api/flows/publication/ui.js')
      off()
    })
  })

  // R29: the effect's dependency list used to include `args.externals` and `args.importModule`
  // directly. `StudioApp` passed both as fresh object/function literals on every render, and
  // re-rendered every `TICK_MS` while a run was in flight, so that dependency list refetched the
  // bundle on every tick; the hook answered it with two refs. A model has no render — both are
  // plain fields on `StudioDeps`, read once per computation — so what is asserted here is the
  // behaviour those refs bought: whatever else moves, the bundle is fetched once per flow.
  it('does not refetch the extension bundle when externals/importModule are new objects each render', async () => {
    const fetchSpy = servedBundle()
    vi.stubGlobal('fetch', fetchSpy)

    await context.start(async () => {
      const flowId = atom<string | undefined>('publication', 'studio.flows.flowId')
      const model = reatomExtension(deps(), { flowId }, 'studio.extension')
      const off = connect(model)
      await wrap(until(() => model.descriptor() !== undefined, 'the bundle'))

      for (let read = 0; read < 5; read++) {
        expect(model.descriptor()).toEqual(DESCRIPTOR)
        await wrap(macrotask())
      }

      expect(fetchSpy).toHaveBeenCalledTimes(1)
      off()
    })
  })

  it('asks for the new flow’s bundle when the flow changes', async () => {
    const fetchSpy = servedBundle()
    vi.stubGlobal('fetch', fetchSpy)

    await context.start(async () => {
      const flowId = atom<string | undefined>('publication', 'studio.flows.flowId')
      const model = reatomExtension(deps(), { flowId }, 'studio.extension')
      const off = connect(model)
      await wrap(until(() => fetchSpy.mock.calls.length === 1, 'the first bundle'))

      flowId.set('pokedex')

      await wrap(until(() => fetchSpy.mock.calls.length === 2, 'the second bundle'))
      expect(fetchSpy).toHaveBeenLastCalledWith('/api/flows/pokedex/ui.js')
      off()
    })
  })

  it('asks for nothing while no flow is selected', async () => {
    const fetchSpy = servedBundle()
    vi.stubGlobal('fetch', fetchSpy)

    await context.start(async () => {
      const flowId = atom<string | undefined>(undefined, 'studio.flows.flowId')
      const model = reatomExtension(deps(), { flowId }, 'studio.extension')
      const off = connect(model)

      await wrap(macrotask())
      await wrap(macrotask())

      expect(fetchSpy).not.toHaveBeenCalled()
      expect(model.descriptor()).toBeUndefined()
      off()
    })
  })

  /**
   * `## Flow-local output UI`: a failure is not an error state. An absent renderer falls back to the
   * generic JSON viewer, and so does a broken one — so a bundle whose default export is not a
   * `defineFlowUi()` descriptor lands as an `Error` value on `bundle` and as `undefined` on
   * `descriptor`, which is what the output viewer reads.
   */
  it('falls back to no renderer when the bundle is not a descriptor', async () => {
    const fetchSpy = servedBundle()
    vi.stubGlobal('fetch', fetchSpy)

    await context.start(async () => {
      const flowId = atom<string | undefined>('publication', 'studio.flows.flowId')
      const model = reatomExtension(
        deps({ importModule: async () => ({}) }),
        { flowId },
        'studio.extension',
      )
      const off = connect(model)

      await wrap(until(() => model.bundle.data() !== undefined, 'the bundle to answer'))

      expect(model.bundle.data()).toBeInstanceOf(Error)
      expect(model.descriptor()).toBeUndefined()
      expect(model.bundle.error()).toBeUndefined()
      off()
    })
  })

  it('falls back to no renderer when the server does not serve one', async () => {
    const fetchSpy = vi.fn(
      async () => ({ ok: false, status: 404, text: async () => '' }) as unknown as Response,
    )
    vi.stubGlobal('fetch', fetchSpy)

    await context.start(async () => {
      const flowId = atom<string | undefined>('publication', 'studio.flows.flowId')
      const model = reatomExtension(deps(), { flowId }, 'studio.extension')
      const off = connect(model)

      await wrap(until(() => model.bundle.data() !== undefined, 'the bundle to answer'))

      expect(model.bundle.data()).toBeInstanceOf(Error)
      expect(model.descriptor()).toBeUndefined()
      off()
    })
  })

  /**
   * The regression this case exists for, and the reason `reset` is not `withAsyncData`'s own.
   *
   * `FlowSwitchModel.switchTo` calls every `reset` and only then moves `flowId`, so a reset always
   * lands on this model *before* the id it is keyed on changes. `withAsyncData().reset` is Reatom's
   * `reset(target)`: it splices the computed's `pubs` down to the actualization slot, dropping every
   * recorded dependency — `flowId` among them — and it deliberately does not refetch. Nothing pulled
   * the computed back afterwards, so the id stopped reaching it and the *first* flow switch of a
   * session detached the flow-local renderer for the rest of that session: `pokedex` and everything
   * after it silently fell back to the generic JSON viewer.
   *
   * The `await`s between the reset and the change are the whole point. Without them both land in one
   * transaction and the write still travels the stale link, which is why every case above passed
   * while the Studio was broken.
   */
  it('asks for the new flow’s bundle after a reset has already landed', async () => {
    const fetchSpy = servedBundle()
    vi.stubGlobal('fetch', fetchSpy)

    await context.start(async () => {
      const flowId = atom<string | undefined>('publication', 'studio.flows.flowId')
      const model = reatomExtension(deps(), { flowId }, 'studio.extension')
      const off = connect(model)
      await wrap(until(() => model.descriptor() !== undefined, 'the first bundle'))

      model.reset()
      await wrap(macrotask())
      await wrap(macrotask())

      flowId.set('pokedex')

      await wrap(until(() => fetchSpy.mock.calls.length === 2, 'the second bundle'))
      expect(fetchSpy).toHaveBeenLastCalledWith('/api/flows/pokedex/ui.js')
      await wrap(until(() => model.descriptor() !== undefined, 'the new flow’s renderer'))
      off()
    })
  })

  /** What one flow switch does to this model: `FlowSwitchModel.switchTo` calls every `reset`. */
  it('drops the renderer it is holding when it is reset', async () => {
    const fetchSpy = servedBundle()
    vi.stubGlobal('fetch', fetchSpy)

    await context.start(async () => {
      const flowId = atom<string | undefined>('publication', 'studio.flows.flowId')
      const model = reatomExtension(deps(), { flowId }, 'studio.extension')
      const off = connect(model)
      await wrap(until(() => model.descriptor() !== undefined, 'the bundle'))

      model.reset()

      expect(model.descriptor()).toBeUndefined()
      off()
    })
  })
})
