import type { FlowDocument } from '@jobik/core'
import { context, wrap } from '@reatom/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JobikClient, RunStreamEvent, SafeFlowDescriptorPayload } from '#client/index.js'
import { reatomStudio } from './studio.js'
import type { StudioDeps, StudioModel } from './types.js'

/**
 * `reatomStudio` — the composition, driven as a whole.
 *
 * Every sub-model has its own file and its own suite, and each of those builds the units its
 * subject takes as `input` by hand: that is what let the twelve be written in parallel, and it is
 * also what none of them can prove. This file is about the wiring itself — that the instance one
 * factory returns is the instance the next one receives, that the two cycles `StudioModel`
 * describes are closed rather than deadlocked, and that a press on one sub-model reaches the four
 * others it is supposed to.
 *
 * **The two rules that make a Reatom model testable this way**, both of which cost earlier waves
 * time. `await` inside `context.start(async …)` leaves the frame, so every one of them here is
 * `await wrap(…)` — including the awaits on the helpers below, because a bare `await` resumes in
 * the global context where none of these atoms have any state at all. And a computed is pull-based:
 * {@link connect} subscribes to what a mounted Studio subscribes to, or the async computeds only
 * ever advance when something reads them, which is not how the app behaves.
 */

/** `start1 ─▶ render`, plus `start2`, which shares the canvas and not one node. */
const DOCUMENT = {
  format: 'jobik.flow',
  version: 1,
  connections: [
    { from: { node: 'start1', field: 'title' }, to: { node: 'render', field: 'text' } },
  ],
  literals: {},
  layout: { start1: { x: 0, y: 0 }, render: { x: 300, y: 0 }, start2: { x: 0, y: 200 } },
} as unknown as FlowDocument

function descriptorNode(id: string, kind: 'start' | 'transform', field: string) {
  return {
    id,
    kind,
    title: id,
    input: {
      nodeId: id,
      fields: [
        { field, required: true, annotation: 'string', control: { kind: 'string' as const } },
      ],
    },
    output: { nodeId: id, fields: [{ field: 'out', required: true, annotation: 'string' }] },
  }
}

const DESCRIPTOR = {
  id: 'publication',
  name: 'publication',
  documentFile: 'flow.jobik.json',
  sourceFile: 'flow.ts',
  startIds: ['start1', 'start2'],
  nodes: [
    descriptorNode('start1', 'start', 'title'),
    descriptorNode('start2', 'start', 'slug'),
    descriptorNode('render', 'transform', 'text'),
  ],
} as unknown as SafeFlowDescriptorPayload

const REPORT = {
  flowName: 'publication',
  startId: 'start1',
  runNumber: 219,
  status: 'ok' as const,
  elapsedMs: 2400,
  nodes: [
    { nodeId: 'start1', status: 'ok' as const, elapsedMs: 10, output: {}, assets: {}, error: null },
    { nodeId: 'render', status: 'ok' as const, elapsedMs: 90, output: {}, assets: {}, error: null },
  ],
  logs: [],
  error: null,
}

/** The one wire finding `3D` derives every mark from. */
const INVALID = {
  _tag: 'GraphValidationError',
  message: 'render.text is not connected',
  findings: [{ code: 'unbound-input', severity: 'error', message: 'render.text is not connected' }],
}

function streamOf(events: readonly RunStreamEvent[]) {
  return (async function* () {
    for (const event of events) yield event
  })()
}

const SETTLED_STREAM: readonly RunStreamEvent[] = [
  { type: 'run-accepted', runToken: 'tok' },
  {
    type: 'run-started',
    runNumber: 219,
    flowName: 'publication',
    startId: 'start1',
    nodeCount: 2,
  },
  { type: 'run-settled', report: REPORT },
] as unknown as readonly RunStreamEvent[]

function stubClient(overrides: Partial<JobikClient> = {}): JobikClient {
  return {
    listFlows: async () => [
      { id: 'publication', name: 'publication', nodeCount: 3 },
      { id: 'pokedex', name: 'pokedex', nodeCount: 2 },
    ],
    loadFlow: async () => ({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: 'rev-1' }),
    validate: async () => ({ valid: true }),
    save: async () => ({ revision: 'rev-2' }),
    startRun: async () => streamOf(SETTLED_STREAM),
    cancelRun: async () => true,
    assetUrl: (asset: { readonly id: string }) => `/api/assets/${asset.id}`,
    extensionBundleUrl: () => '/api/flows/publication/ui.js',
    ...overrides,
  } as unknown as JobikClient
}

/**
 * `model/extension.ts` fetches its flow-local bundle from the global `fetch`, and a card whose node
 * settled `ok` reads that descriptor. Nothing here is about the flow-local renderer, so the fetch
 * answers a 404 and `extension.descriptor` stays `undefined` — the generic viewer's own case.
 */
function stubBundleFetch(): void {
  vi.stubGlobal('fetch', async () => ({ ok: false, status: 404, text: async () => '' }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * What a mounted Studio subscribes to.
 *
 * `canvas.overlays` is deliberately absent and `canvas.nodeOverlay` deliberately present: reading
 * the map is a subscription to every node's overlay by construction, and the whole point of the
 * accessor is that a card does not do that.
 */
function connect(model: StudioModel): () => void {
  const unsubscribe = [
    model.flows.flows.subscribe(() => {}),
    model.flows.descriptor.subscribe(() => {}),
    model.draft.document.subscribe(() => {}),
    model.draft.dirty.subscribe(() => {}),
    model.inputs.startId.subscribe(() => {}),
    model.inputs.presentation.subscribe(() => {}),
    model.validation.topBar.subscribe(() => {}),
    model.run.session.subscribe(() => {}),
    model.run.history.subscribe(() => {}),
    model.output.viewerNodeId.subscribe(() => {}),
    model.canvas.nodes.subscribe(() => {}),
    model.canvas.edges.subscribe(() => {}),
    model.runPanel.state.subscribe(() => {}),
    model.flowSwitch.body.subscribe(() => {}),
    model.shortcuts.bound.subscribe(() => {}),
  ]
  return () => {
    for (const off of unsubscribe) off()
  }
}

const macrotask = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Drives the frame until `predicate` holds. Call it as `await wrap(until(…))`. */
async function until(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return
    await wrap(macrotask())
  }
  throw new Error(`timed out waiting for ${label}`)
}

function gate(): { readonly promise: Promise<void>; release: () => void } {
  let release = () => {}
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}

/**
 * One isolated Reatom frame per case, with one composed Studio in it.
 *
 * `subscribeTo` exists for the one case that must *not* subscribe to everything: `3F`'s
 * self-answering switch is armed by a connection, and the trap it closes is a surface that reads
 * only one of the three units the dialog is drawn from.
 */
function inFrame(
  body: (model: StudioModel) => Promise<void>,
  options: {
    client?: JobikClient
    name?: string
    subscribeTo?: (model: StudioModel) => (() => void)[]
  } = {},
): Promise<void> {
  stubBundleFetch()
  const deps: StudioDeps = { client: options.client ?? stubClient(), now: () => 1_000 }
  return wrap(
    context.start(async () => {
      const model = reatomStudio(deps, options.name ?? 'studio')
      const off =
        options.subscribeTo === undefined
          ? connect(model)
          : (() => {
              const unsubscribe = options.subscribeTo(model)
              return () => {
                for (const one of unsubscribe) one()
              }
            })()
      try {
        await wrap(body(model))
      } finally {
        off()
      }
    }),
  )
}

/**
 * The mount every case but the first starts from: the first flow listed, loaded and seeded.
 *
 * It returns `wrap(…)`'s promise rather than an `async` function's, and that is load-bearing: an
 * `await` on a bare promise resumes outside the frame `context.start` opened, and every read after
 * it would answer `undefined` from a context these atoms were never written in.
 */
function mounted(model: StudioModel): Promise<void> {
  return wrap(until(() => model.flows.descriptor() !== undefined, 'the first flow to load'))
}

describe('the composition', () => {
  it('keeps the deps it was handed, untouched, so a surface can reach the client through it', () => {
    const deps: StudioDeps = { client: stubClient(), now: () => 1_000 }

    expect(reatomStudio(deps).deps).toBe(deps)
  })

  /**
   * The stub this replaced returned twelve `Proxy` slots that threw the name of the factory that
   * owed them. Nothing throws now, and every slot answers.
   */
  it('fills all twelve slots with real sub-models', async () => {
    await inFrame(async (model) => {
      await mounted(model)

      expect(model.flows.flowId()).toBe('publication')
      expect(model.draft.document()).toBe(DOCUMENT)
      expect(model.save.state()).toEqual({ kind: 'idle' })
      expect(model.inputs.startId()).toBe('start1')
      expect(model.validation.state()).toBeUndefined()
      expect(model.extension.descriptor()).toBeUndefined()
      expect(model.run.running()).toBe(false)
      expect(model.output.viewerNodeId()).toBeUndefined()
      expect(model.canvas.nodes()).toHaveLength(3)
      expect(model.runPanel.state()?.kind).toBe('idle')
      expect(model.flowSwitch.pendingFlowId()).toBeUndefined()
      expect(model.shortcuts.bound()).toBe(true)
    })
  })

  // Every unit is named from the root `name`, so two Studios in one page — or one test file — never
  // collide in a trace. RTM-S05.
  it('names every unit from the name it was given', () => {
    const deps: StudioDeps = { client: stubClient(), now: () => 1_000 }

    expect(reatomStudio(deps, 'first').run.session.name).toBe('first.run.session')
    expect(reatomStudio(deps, 'second').run.session.name).toBe('second.run.session')
    expect(reatomStudio(deps).canvas.nodes.name).toBe('studio.canvas.nodes')
  })

  it('seeds the flow, the draft, the panel and the canvas from one load', async () => {
    const loadFlow = vi.fn(async () => ({
      descriptor: DESCRIPTOR,
      document: DOCUMENT,
      revision: 'rev-1',
    }))

    await inFrame(
      async (model) => {
        await mounted(model)

        // One listing, one load: discovery seeds `flowId`, and `loaded` is keyed on it.
        expect(loadFlow).toHaveBeenCalledTimes(1)
        expect(model.flows.flows()).toHaveLength(2)
        expect(model.draft.dirty()).toBe(false)
        expect(model.inputs.selectedNodeId()).toBe('start1')
        expect(model.inputs.presentation()).toHaveProperty('title')
        expect(model.canvas.edges()).toHaveLength(1)
      },
      { client: stubClient({ loadFlow }) },
    )
  })
})

/**
 * Cycle 1, and the one forwarder that breaks it: `locked` is `run.running`, forwarded to the four
 * sub-models wired above `run`. Each of them has its own test for the guard; what is proved here is
 * that the forwarder actually reaches them, which no single sub-model's suite can say.
 */
describe('the draft lock a run holds', () => {
  it('locks the draft, the save, the start selection and the validation while a run streams', async () => {
    const streamGate = gate()
    const save = vi.fn(async () => ({ revision: 'rev-2' }))
    const validate = vi.fn<JobikClient['validate']>(async () => ({ valid: true }))

    await inFrame(
      async (model) => {
        await mounted(model)
        model.inputs.setInputField('title', 'A post')
        model.run.runFromDraft()
        await wrap(until(() => model.run.running(), 'the run to be in flight'))

        model.draft.moveNode({ nodeId: 'start1', position: { x: 99, y: 99 } })
        model.inputs.selectStart('start2')
        model.validation.validate()
        void model.save.save().catch(() => {})
        await wrap(macrotask())

        expect(model.draft.dirty()).toBe(false)
        expect(model.inputs.startId()).toBe('start1')
        expect(model.validation.state()).toBeUndefined()
        expect(validate).not.toHaveBeenCalled()
        expect(save).not.toHaveBeenCalled()

        streamGate.release()
        await wrap(until(() => !model.run.running(), 'the run to settle'))

        // And the lock lifts with the run, rather than being a one-way door.
        model.draft.moveNode({ nodeId: 'start1', position: { x: 99, y: 99 } })
        expect(model.draft.dirty()).toBe(true)
      },
      {
        client: stubClient({
          save,
          validate,
          startRun: async () =>
            (async function* () {
              yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
              await streamGate.promise
              yield { type: 'run-settled', report: REPORT } as RunStreamEvent
            })(),
        }),
      },
    )
  })

  // The forward half of the same cycle: `run` reads `draft.savedDocument` and `inputs.startId`.
  it('runs the start the panel is pointed at, over the document that is on disk', async () => {
    const streamGate = gate()
    const startRun = vi.fn(async () =>
      (async function* () {
        yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
        await streamGate.promise
        yield { type: 'run-settled', report: REPORT } as RunStreamEvent
      })(),
    )

    await inFrame(
      async (model) => {
        await mounted(model)
        model.inputs.selectStart('start2')
        model.inputs.setInputField('slug', 'a-post')

        void model.run.start({ slug: 'a-post' })
        await wrap(until(() => model.run.running(), 'the run to be in flight'))

        expect(startRun).toHaveBeenCalledWith({
          flowId: 'publication',
          startId: 'start2',
          input: { slug: 'a-post' },
        })
        // The seeded session, before any report overwrites it: `runGraphNodeIds` read the saved
        // document, and `start2` reaches no other node in it.
        expect([...(model.run.session()?.nodes.keys() ?? [])]).toEqual(['start2'])

        streamGate.release()
        await wrap(until(() => !model.run.running(), 'the run to settle'))
      },
      { client: stubClient({ startRun }) },
    )
  })
})

/**
 * Cycle 2. Its back-edge is the same one — `validation.validate` refuses while `locked` — and its
 * forward half needs no forwarder at all, because `validation` is wired above `run` and hands over
 * the real `blocked`. Both halves are asserted here, in one composed model.
 */
describe('the validation gate', () => {
  it('refuses to start a run while a standing error blocks it', async () => {
    const startRun = vi.fn(async () => streamOf(SETTLED_STREAM))

    await inFrame(
      async (model) => {
        await mounted(model)
        model.inputs.setInputField('title', 'A post')

        model.validation.validate()
        await wrap(until(() => model.validation.blocked(), 'the rejected document'))

        model.run.runFromDraft()
        await wrap(macrotask())

        expect(startRun).not.toHaveBeenCalled()
        expect(model.run.session()).toBeUndefined()
      },
      {
        client: stubClient({
          startRun,
          validate: async () => ({ valid: false, error: INVALID }),
        }),
      },
    )
  })

  it('lets a run start once the findings are only warnings', async () => {
    const startRun = vi.fn(async () => streamOf(SETTLED_STREAM))

    await inFrame(
      async (model) => {
        await mounted(model)
        model.inputs.setInputField('title', 'A post')

        model.validation.validate()
        await wrap(until(() => model.validation.state() !== undefined, 'the check to answer'))
        expect(model.validation.blocked()).toBe(false)

        model.run.runFromDraft()
        await wrap(until(() => startRun.mock.calls.length === 1, 'the run to be issued'))
      },
      { client: stubClient({ startRun }) },
    )
  })
})

/**
 * The contract gap `StudioApp.selectStart` used to close by hand: `OutputModel` had no `startId`
 * and `InputsModel` knows nothing about a viewer, so no sub-model owned it. The owner is
 * `reatomOutput`, which takes `inputs.startId` as an input and closes on it as a derivation — the
 * wiring hands it over, and a surface calling `selectStart` has nothing to remember.
 */
describe('the output viewer and the selected start', () => {
  it('closes an open output viewer when the panel is pointed at another start', async () => {
    await inFrame(async (model) => {
      await mounted(model)
      await wrap(model.run.start({ title: 'A post' }))
      model.output.open('render')
      expect(model.output.openViewerNode()?.nodeId).toBe('render')

      model.inputs.selectStart('start2')

      expect(model.output.viewerNodeId()).toBeUndefined()
      expect(model.output.dockStrings()).toBeUndefined()
    })
  })

  it('leaves it open when selectStart is refused, because nothing moved', async () => {
    await inFrame(async (model) => {
      await mounted(model)
      await wrap(model.run.start({ title: 'A post' }))
      model.output.open('render')

      // Not a declared start: `reatomInputs` ignores it, so `startId` never moves and the
      // derivation behind the viewer never fires.
      model.inputs.selectStart('nope')

      expect(model.output.viewerNodeId()).toBe('render')
    })
  })
})

/**
 * `3F`'s dialog can answer itself: once the run it is asking about settles, nothing is at risk and
 * the switch the user asked for happens. That reaction is owned by a connection, and the trap it
 * used to carry is that the connection was `body`'s — so a surface that read `pendingFlowId` for
 * its `open` flag and drew the body from somewhere else armed nothing at all, silently.
 */
describe("3F's self-answering switch", () => {
  it('answers for a surface that reads pendingFlowId and nothing else', async () => {
    const streamGate = gate()

    await inFrame(
      async (model) => {
        await wrap(until(() => model.flows.flowId() === 'publication', 'discovery'))
        model.run.runFromDraft()
        await wrap(until(() => model.run.running(), 'the run to be in flight'))

        model.flowSwitch.requestFlow('pokedex')
        expect(model.flowSwitch.pendingFlowId()).toBe('pokedex')

        streamGate.release()
        await wrap(until(() => !model.run.running(), 'the run to settle'))
        await wrap(macrotask())

        expect(model.flowSwitch.pendingFlowId()).toBeUndefined()
        expect(model.flows.flowId()).toBe('pokedex')
      },
      {
        client: stubClient({
          startRun: async () =>
            (async function* () {
              yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
              await streamGate.promise
              yield { type: 'run-settled', report: REPORT } as RunStreamEvent
            })(),
        }),
        // The whole point: the only flowSwitch unit this surface reads is `pendingFlowId`. The
        // three `flows`/`inputs` subscriptions are what makes the flow load at all.
        subscribeTo: (model) => [
          model.flows.flows.subscribe(() => {}),
          model.flows.descriptor.subscribe(() => {}),
          model.inputs.startId.subscribe(() => {}),
          model.flowSwitch.pendingFlowId.subscribe(() => {}),
        ],
      },
    )
  })

  it('resets every sub-model before it moves the flow', async () => {
    await inFrame(async (model) => {
      await mounted(model)
      await wrap(model.run.start({ title: 'A post' }))
      model.output.open('render')
      model.inputs.setInputField('title', 'A post')
      model.draft.moveNode({ nodeId: 'start1', position: { x: 42, y: 42 } })
      expect(model.draft.dirty()).toBe(true)

      model.flowSwitch.switchTo('pokedex')

      expect(model.flows.flowId()).toBe('pokedex')
      expect(model.draft.dirty()).toBe(false)
      expect(model.run.session()).toBeUndefined()
      expect(model.output.viewerNodeId()).toBeUndefined()
      // `inputs.reset()` ran before `flows.selectFlow`, which is what makes F10's predicate answer
      // `false` for a switch and re-seed from the new flow's own descriptor.
      expect(model.inputs.startId()).toBeUndefined()
      expect(model.inputs.inputDraft()).toEqual({})
    })
  })
})

/**
 * The accessor `NodeCard` reads instead of taking its overlay out of the node array — and the whole
 * reason it is on {@link StudioModel} rather than only on `reatomCanvas`'s return type: a surface
 * that can reach `model.canvas` must be able to ask.
 */
describe('the canvas', () => {
  it('offers one node its own overlay through StudioModel.canvas', async () => {
    await inFrame(async (model) => {
      await mounted(model)
      const overlay = model.canvas.nodeOverlay('render')
      const off = overlay.subscribe(() => {})
      try {
        expect(overlay()).toBeUndefined()

        await wrap(model.run.start({ title: 'A post' }))

        expect(overlay()?.status).toBe('ok')
        // The same accessor answers the same unit, so a card that re-reads does not rebuild.
        expect(model.canvas.nodeOverlay('render')).toBe(overlay)
      } finally {
        off()
      }
    })
  })

  it('carries the marked start through to the node array', async () => {
    await inFrame(async (model) => {
      await mounted(model)
      expect(model.canvas.nodes().find((node) => node.data.selected)?.id).toBe('start1')

      model.inputs.selectStart('start2')

      expect(model.canvas.nodes().find((node) => node.data.selected)?.id).toBe('start2')
    })
  })
})

/**
 * The last link in the chain, and the one that proves the wiring end to end: a key press reaches
 * `shortcuts`, which reaches `run.runFromDraft`, which reaches `inputs.values`, which reads the
 * draft `inputs` seeded from the descriptor `flows` loaded.
 */
describe('the global keys', () => {
  it('runs the flow from a ⌘↵ press, through four sub-models', async () => {
    const startRun = vi.fn(async () => streamOf(SETTLED_STREAM))

    await inFrame(
      async (model) => {
        await mounted(model)
        model.inputs.setInputField('title', 'A post')

        model.shortcuts.onKeyDown(
          new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, cancelable: true }),
        )
        await wrap(until(() => startRun.mock.calls.length === 1, 'the run to be issued'))

        expect(startRun).toHaveBeenCalledWith({
          flowId: 'publication',
          startId: 'start1',
          input: { title: 'A post' },
        })
      },
      { client: stubClient({ startRun }) },
    )
  })

  /**
   * F-S2: `esc` puts the dock away as `2A`'s 34px collapsed strip rather than taking it out of the
   * shell — the same outcome as its own `×`, and the reason `4A`'s 180ms height settle has a
   * from-value to play from. The node it summarises survives, because the strip still names it.
   */
  it('collapses the output dock on esc before it offers to cancel anything', async () => {
    await inFrame(async (model) => {
      await mounted(model)
      await wrap(model.run.start({ title: 'A post' }))
      model.output.open('render')

      model.shortcuts.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))

      expect(model.output.collapsed()).toBe(true)
      expect(model.output.viewerNodeId()).toBe('render')
      expect(model.run.cancelPrompt()).toBe(false)
    })
  })
})

/**
 * The flow-local renderer across a flow switch — a composition case, because the defect was in the
 * transition and not in either module on its own.
 *
 * `flowSwitch.switchTo` calls `extension.reset()` and only then `flows.selectFlow`. That reset used
 * to be `withAsyncData`'s own, which is Reatom's `reset(target)`: it splices the computed's `pubs`
 * down to the actualization slot — dropping `flowId`, the very key the bundle is keyed on — and it
 * deliberately does not refetch. `GET /api/flows/:id/ui.js` therefore fired for the flow the Studio
 * booted on and never again, and every flow switched to afterwards fell back to the generic JSON
 * viewer with no request in the network tab to show for it.
 *
 * This case wires its own frame rather than going through {@link inFrame}: it needs a `fetch` that
 * serves a descriptor instead of the 404 every other case here wants, a client that gives each flow
 * its own bundle url, and — the part that reproduces it — a subscription to `extension.descriptor`
 * standing from before the first flow lands, which is when `StudioApp` reads it.
 */
describe('the flow-local renderer across a switch', () => {
  it('asks for each flow’s own ui.js, switch after switch', async () => {
    const fetchSpy = vi.fn(
      async () => ({ ok: true, text: async () => 'export default {}' }) as unknown as Response,
    )
    vi.stubGlobal('fetch', fetchSpy)

    const deps: StudioDeps = {
      client: stubClient({
        extensionBundleUrl: (flowId: string) => `/api/flows/${flowId}/ui.js`,
      } as unknown as Partial<JobikClient>),
      importModule: async () => ({ default: { nodes: {} } }),
      now: () => 1_000,
    }

    await wrap(
      context.start(async () => {
        const model = reatomStudio(deps, 'studio')
        const off = connect(model)
        const offExtension = model.extension.descriptor.subscribe(() => {})
        try {
          await wrap(until(() => fetchSpy.mock.calls.length === 1, 'the first bundle'))
          expect(fetchSpy).toHaveBeenLastCalledWith('/api/flows/publication/ui.js')

          model.flowSwitch.switchTo('pokedex')

          await wrap(until(() => fetchSpy.mock.calls.length === 2, 'the second bundle'))
          expect(fetchSpy).toHaveBeenLastCalledWith('/api/flows/pokedex/ui.js')
          await wrap(until(() => model.extension.descriptor() !== undefined, 'the new renderer'))

          model.flowSwitch.switchTo('publication')

          await wrap(until(() => fetchSpy.mock.calls.length === 3, 'the third bundle'))
          expect(fetchSpy).toHaveBeenLastCalledWith('/api/flows/publication/ui.js')
        } finally {
          offExtension()
          off()
        }
      }),
    )
  })
})
