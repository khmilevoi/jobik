import type { FlowDocument } from '@jobik/core'
import { action, atom, computed, context, wrap } from '@reatom/core'
import { describe, expect, it, vi } from 'vitest'
import type { JobikClient, RunStreamEvent, WireNodeReportPayload } from '#client/index.js'
import { JobikServerError, JobikTransportError } from '#client/index.js'
import type { CopyState, DownloadState } from '#primitives/index.js'
import { reatomDraft } from './draft.js'
import { reatomExtension } from './extension.js'
import { reatomFlowSwitch } from './flowSwitch.js'
import { reatomFlows } from './flows.js'
import { reatomInputs } from './inputs.js'
import { reatomRun } from './run.js'
import { reatomSave } from './save.js'
import type { FlowSwitchModel, OutputModel, StudioDeps } from './types.js'
import { reatomValidation } from './validation.js'

/**
 * `3F` — the flow switch, driven directly inside a `context.start()` frame.
 *
 * Every case whose name also appears in `studio/StudioApp/StudioApp.test.tsx`, or appeared in the
 * now-deleted `studio/useStudioSession.test.ts`, is a port of that case and keeps its name, so the
 * port stays auditable. The cases named for something else are new to the model and say so in
 * their own comment.
 *
 * **The sub-models here are the real ones.** `reatomFlowSwitch` takes whole sub-models because
 * `switchTo` is the one place that calls every `reset`, and the assertion this task exists to carry
 * across is precisely that each of those resets actually happened. Standing in hand-made atoms for
 * them would assert that `switchTo` called eight functions, which is not the same statement at all.
 * The module under test still imports none of them: it depends on the interfaces in `types.ts`, and
 * this harness is `model/studio.ts`'s wiring written out by hand — including the two lazily-read
 * forwarders (`locked`, `blocked`) that break the two cycles.
 *
 * `output` is the one exception, and it is a stub: `model/output.ts` is another agent's file, and
 * naming it here would tie this file's cases to a module this task never depended on. What
 * `switchTo` owes it is exactly one `reset`, and the stub counts it.
 *
 * Two rules make a Reatom model testable this way. Every `await` inside `context.start` is
 * `await wrap(…)` — including awaits on the helpers below — because a bare `await` resumes in the
 * global context where none of these atoms have any state. And a computed is pull-based, so
 * {@link connect} subscribes to what a mounted Studio subscribes to; without it the async computeds
 * would only ever advance on a read.
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
  documentFile: 'pokedex.jobik.json',
  startIds: ['byName'],
  nodes: [{ ...DESCRIPTOR.nodes[0], id: 'byName' }],
}

const REPORT = {
  flowName: 'publication',
  startId: 'start1',
  runNumber: 221,
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

const CONFLICT = new JobikServerError({
  reason: 'changed on disk',
  status: 409,
  payload: {
    _tag: 'FlowRevisionConflictError',
    message: 'changed on disk',
    expectedRevision: 'rev-1',
    actualRevision: 'rev-9',
  },
})

function streamOf(events: readonly RunStreamEvent[]) {
  return (async function* () {
    for (const event of events) yield event
  })()
}

/** Two flows behind one client, each answering with its own descriptor and document. */
function twoFlowClient(overrides: Partial<JobikClient> = {}): JobikClient {
  return {
    listFlows: async () => [
      { id: 'publication', name: 'publication', nodeCount: 1 },
      { id: 'pokedex', name: 'pokedex', nodeCount: 2 },
    ],
    loadFlow: async (id: string) =>
      id === 'pokedex'
        ? { descriptor: POKEDEX_DESCRIPTOR, document: POKEDEX_DOCUMENT, revision: 'rev-p1' }
        : { descriptor: DESCRIPTOR, document: DOCUMENT, revision: 'rev-1' },
    validate: async () => ({ valid: true }),
    save: async () => ({ revision: 'rev-2' }),
    startRun: async () => new JobikTransportError({ url: '/api/runs' }),
    cancelRun: async () => true,
    assetUrl: (asset: { readonly id: string }) => `/api/assets/${asset.id}`,
    extensionBundleUrl: () => '/api/flows/publication/ui.js',
    ...overrides,
  } as unknown as JobikClient
}

/**
 * The output model, as much of it as `switchTo` can see: one `reset`, and the viewer id that
 * `reset` is supposed to drop. `model/output.ts` belongs to another agent, so this file names it
 * nowhere.
 */
function stubOutput(name: string) {
  const viewerNodeId = atom<string | undefined>(undefined, `${name}.viewerNodeId`)
  const collapsed = atom(false, `${name}.collapsed`)
  let resets = 0

  const model: OutputModel = {
    viewerNodeId,
    openViewerNode: computed<WireNodeReportPayload | undefined>(
      () => undefined,
      `${name}.openViewerNode`,
    ),
    dockNode: computed<WireNodeReportPayload | undefined>(() => undefined, `${name}.dockNode`),
    expanded: computed(() => viewerNodeId() !== undefined && !collapsed(), `${name}.expanded`),
    dockStrings: computed<{ readonly context: string; readonly summary: string } | undefined>(
      () => undefined,
      `${name}.dockStrings`,
    ),
    logs: computed<readonly { readonly time: string; readonly message: string }[]>(
      () => [],
      `${name}.logs`,
    ),
    collapsed,
    open: action((nodeId: string) => {
      viewerNodeId.set(nodeId)
      collapsed.set(false)
    }, `${name}.open`),
    expand: action(() => {
      collapsed.set(false)
    }, `${name}.expand`),
    collapse: action(() => {
      collapsed.set(true)
    }, `${name}.collapse`),
    close: action(() => {
      viewerNodeId.set(undefined)
      collapsed.set(false)
    }, `${name}.close`),
    copyAll: action(() => {}, `${name}.copyAll`),
    download: action(() => {}, `${name}.download`),
    // `3A`'s two cells, on the contract since the closing wave folded them onto `OutputModel`.
    // Neither sequence runs here — this stub is the viewer id and `reset`, and nothing else.
    copyState: atom<CopyState>('idle', `${name}.copyState`),
    downloadState: atom<DownloadState>('idle', `${name}.downloadState`),
    reset: action(() => {
      resets += 1
      viewerNodeId.set(undefined)
    }, `${name}.reset`),
  }

  return { model, resets: () => resets }
}

/** `model/studio.ts`'s wiring, written out by hand: every sub-model, in the declared order. */
function makeHarness(client: JobikClient) {
  const clock = { value: 1000 }
  const deps: StudioDeps = { client, now: () => clock.value }

  const flows = reatomFlows(deps, 'test.flows')

  // The two cycles `StudioModel` describes, forwarded through lazily-read computeds declared before
  // the models that consume them — exactly as `studio.ts` will do it, and for the same reason: a
  // computed body does not run until something reads it, by which time the sub-model it names is
  // assigned.
  const locked = computed(() => run.running(), 'test.locked')
  const blocked = computed(() => validation.blocked(), 'test.blocked')

  const draft = reatomDraft(deps, { loaded: flows.loaded, locked }, 'test.draft')
  const save = reatomSave(
    deps,
    { flowId: flows.flowId, draft: draft.draft, markSaved: draft.markSaved, locked },
    'test.save',
  )
  const inputs = reatomInputs(
    deps,
    { descriptor: flows.descriptor, loaded: flows.loaded, locked },
    'test.inputs',
  )
  const validation = reatomValidation(
    deps,
    { flowId: flows.flowId, document: draft.document, descriptor: flows.descriptor, locked },
    'test.validation',
  )
  const extension = reatomExtension(deps, { flowId: flows.flowId }, 'test.extension')
  const run = reatomRun(
    deps,
    {
      flowId: flows.flowId,
      descriptor: flows.descriptor,
      startId: inputs.startId,
      savedDocument: draft.savedDocument,
      inputValues: inputs.values,
      inputIssues: inputs.issues,
      blocked,
    },
    'test.run',
  )
  const output = stubOutput('test.output')

  const model = reatomFlowSwitch(
    deps,
    {
      flows,
      draft,
      save,
      inputs,
      validation,
      extension,
      run,
      output: output.model,
    },
    'test.flowSwitch',
  )

  return { model, deps, clock, flows, draft, save, inputs, validation, extension, run, output }
}

type Harness = ReturnType<typeof makeHarness>

/**
 * What a mounted Studio subscribes to. `body` is on the list because `3F`'s dialog reads it, and
 * reading it connects `pendingFlowId` — which is what owns the reaction that lets the question
 * answer itself, and therefore what arms it here. `model/studio.test.ts` pins the other direction:
 * a surface that reads `pendingFlowId` alone arms it too.
 *
 * `extension.bundle` is deliberately absent: it fetches, and nothing in this file is about the
 * flow-local renderer.
 */
function connect(h: Harness): () => void {
  const unsubscribe = [
    h.flows.flows.subscribe(() => {}),
    h.flows.descriptor.subscribe(() => {}),
    h.draft.dirty.subscribe(() => {}),
    h.inputs.startId.subscribe(() => {}),
    h.model.body.subscribe(() => {}),
    h.model.pendingFlowName.subscribe(() => {}),
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

/** One isolated Reatom frame per case, with the first flow already loaded. */
function inFrame(
  client: JobikClient,
  body: (h: Harness, off: () => void) => Promise<void>,
): Promise<void> {
  return wrap(
    context.start(async () => {
      const h = makeHarness(client)
      const off = connect(h)
      await wrap(until(() => h.flows.descriptor()?.id === 'publication', 'the first flow'))
      await wrap(body(h, off))
      off()
    }),
  )
}

/** Starts a run of `start1` and waits for the stream to be open. */
async function startRun(h: Harness): Promise<void> {
  h.inputs.setInputField('title', 't')
  h.run.runFromDraft()
  await wrap(until(() => h.run.running(), 'the run to open'))
}

/** The running body, narrowed. Reading `kind` off the union is what every `3F` case starts with. */
function runningBody(model: FlowSwitchModel) {
  const body = model.body()
  if (body?.kind !== 'running') throw new Error(`expected the running body, got ${body?.kind}`)
  return body
}

function unsavedBody(model: FlowSwitchModel) {
  const body = model.body()
  if (body?.kind !== 'unsaved') throw new Error(`expected the unsaved body, got ${body?.kind}`)
  return body
}

describe('switching flows', () => {
  /**
   * The whole reset, in one assertion set — the hook's case, minus the one piece
   * `model/flows.test.ts` already carries (`descriptor`) and plus the four `StudioApp` held rather
   * than the hook: the run archive, the picked row, the open output viewer and the dialog's own
   * held-back target.
   *
   * Asserted synchronously, on the transition itself and before the new flow's load resolves —
   * the exact window the old code left the previous flow standing in.
   */
  it('clears every piece of the previous flow before the new one lands', async () => {
    await inFrame(
      twoFlowClient({
        startRun: async () =>
          streamOf([
            { type: 'run-accepted', runToken: 'tok' },
            { type: 'run-settled', report: REPORT },
          ]),
        validate: async () => ({
          valid: false,
          error: { _tag: 'ConnectionError', message: 'render.markdown expects string' },
        }),
        save: async () => CONFLICT,
      }),
      async (h) => {
        await wrap(startRun(h))
        await wrap(until(() => !h.run.running(), 'the run to settle'))
        h.validation.validate()
        await wrap(until(() => h.validation.state()?.kind === 'invalid', 'the rejected document'))
        h.draft.moveNode({ nodeId: 'start1', position: { x: 5, y: 5 } })
        h.inputs.setInputField('title', 'typed')
        h.output.model.open('start1')
        h.model.requestFlow('pokedex')
        await wrap(h.save.save())

        expect(h.run.session()).toBeDefined()
        expect(h.run.archive()).toHaveLength(1)
        expect(h.validation.state()?.kind).toBe('invalid')
        expect(h.draft.dirty()).toBe(true)
        expect(h.save.state().kind).toBe('conflict')
        expect(h.model.pendingFlowId()).toBe('pokedex')

        // `commitSwitch`, not `switchTo`: the subject here is the transition — every `reset`, then
        // `flows.selectFlow` — and `switchTo` would park it behind the dialog's exit, which is
        // `4A`'s ordering and has its own cases at the end of this file.
        h.model.commitSwitch('pokedex')

        expect(h.flows.flowId()).toBe('pokedex')
        expect(h.draft.draft()).toBeUndefined()
        expect(h.inputs.startId()).toBeUndefined()
        expect(h.inputs.selectedNodeId()).toBeUndefined()
        expect(h.inputs.inputDraft()).toEqual({})
        expect(h.inputs.issues()).toBeUndefined()
        expect(h.save.state()).toEqual({ kind: 'idle' })
        expect(h.run.session()).toBeUndefined()
        expect(h.run.lastReport()).toBeUndefined()
        expect(h.run.running()).toBe(false)
        expect(h.run.archive()).toEqual([])
        expect(h.run.selectedRunId()).toBeUndefined()
        expect(h.validation.state()).toBeUndefined()
        expect(h.validation.chip()).toBe('idle')
        expect(h.output.resets()).toBe(1)
        expect(h.output.model.viewerNodeId()).toBeUndefined()
        expect(h.model.pendingFlowId()).toBeUndefined()
        expect(h.model.saveAndSwitchTo()).toBeUndefined()
      },
    )
  })

  /**
   * Decided behaviour, recorded as a test so it cannot drift into something nobody drew: the draft
   * is not preserved and is never written on the way out. `3F` asks first — that is the dialog —
   * but the answer that switches discards it, and `switchTo` itself is never blocked by it.
   */
  it('discards a dirty draft rather than blocking the switch', async () => {
    const save = vi.fn(async () => ({ revision: 'rev-2' }))
    await inFrame(twoFlowClient({ save }), async (h) => {
      h.draft.moveNode({ nodeId: 'start1', position: { x: 5, y: 5 } })
      expect(h.draft.dirty()).toBe(true)

      h.model.requestFlow('pokedex')
      h.model.switchToPending()
      // The dialog leaves first; `switchExited` is what a mounted `SwitchFlowModal` reports when
      // the card's departure has played out. See the `4A` block at the end of this file.
      h.model.switchExited()
      await wrap(until(() => h.flows.descriptor()?.id === 'pokedex', 'the second flow'))

      expect(h.draft.dirty()).toBe(false)
      expect(h.draft.draft()?.baseRevision).toBe('rev-p1')
      expect(save).not.toHaveBeenCalled()
    })
  })

  /**
   * Part 2. The switch is immediate; the run keeps going server-side and is drained to completion
   * so the server settles it; its events simply stop reaching the panel.
   */
  it('never blocks on a run in flight, and that run never paints the new flow', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const drained: string[] = []

    await inFrame(
      twoFlowClient({
        startRun: async () =>
          (async function* () {
            yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
            drained.push('run-accepted')
            await gate
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
      async (h) => {
        await wrap(startRun(h))

        // The transition itself; the dialog's exit is not what this case is about.
        h.model.commitSwitch('pokedex')
        expect(h.run.running()).toBe(false)
        expect(h.run.session()).toBeUndefined()

        release()
        await wrap(until(() => drained.length === 3, 'the stream to drain'))
        await wrap(until(() => h.flows.descriptor()?.id === 'pokedex', 'the second flow'))

        // Drained to the end — the server settles the run rather than being left with a reader that
        // walked away — and not one of those events reached the panel.
        expect(drained).toEqual(['run-accepted', 'run-started', 'run-settled'])
        expect(h.run.session()).toBeUndefined()
        expect(h.run.lastReport()).toBeUndefined()
        expect(h.run.running()).toBe(false)
        expect(h.run.archive()).toEqual([])
      },
    )
  })
})

describe('switching the active flow', () => {
  it('lists every flow and loads the one whose row is pressed', async () => {
    await inFrame(twoFlowClient(), async (h) => {
      expect(h.flows.flows().map((flow) => flow.id)).toEqual(['publication', 'pokedex'])

      h.model.requestFlow('pokedex')

      // `3F` guards a switch that would lose something; a clean draft and no run loses nothing, so
      // the common case never sees a dialog.
      expect(h.model.pendingFlowId()).toBeUndefined()
      expect(h.model.body()).toBeUndefined()
      await wrap(until(() => h.flows.descriptor()?.id === 'pokedex', 'the second flow'))
      expect(h.inputs.startId()).toBe('byName')
    })
  })

  it('drops the previous flow run history, output dock and validation strip', async () => {
    await inFrame(
      twoFlowClient({
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
        validate: async () => ({
          valid: false,
          error: { _tag: 'ConnectionError', message: 'render.markdown expects string' },
        }),
      }),
      async (h) => {
        await wrap(startRun(h))
        await wrap(until(() => h.run.archive().length === 1, 'the run to be archived'))
        h.output.model.open('start1')
        h.validation.validate()
        await wrap(until(() => h.validation.state()?.kind === 'invalid', 'the rejected document'))

        expect(h.run.history()).toHaveLength(1)
        expect(h.validation.problems().problems).toHaveLength(1)

        h.model.requestFlow('pokedex')

        expect(h.run.history()).toEqual([])
        expect(h.output.model.viewerNodeId()).toBeUndefined()
        expect(h.validation.active()).toBeUndefined()
        expect(h.validation.problems().problems).toEqual([])
      },
    )
  })
})

/**
 * Artboard `3F` — the two switches that lose something, and the dialog that stands in front of
 * them. Ported from `studio/StudioApp/StudioApp.test.tsx`, where they were driven through the DOM.
 */
describe('3F — switching away from a run in flight', () => {
  /** A run whose stream is held open until the case releases it. */
  function midRunClient(overrides: Partial<JobikClient> = {}) {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const client = twoFlowClient({
      startRun: async () =>
        (async function* () {
          yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
          yield {
            type: 'run-started',
            runNumber: 221,
            flowName: 'publication',
            startId: 'start1',
            nodeCount: 1,
          } as RunStreamEvent
          await gate
          yield { type: 'run-settled', report: REPORT } as RunStreamEvent
        })(),
      ...overrides,
    })
    return { client, release: () => release() }
  }

  it('asks first, on the run body, and stays where it is until it is answered', async () => {
    const { client, release } = midRunClient()
    await inFrame(client, async (h) => {
      await wrap(startRun(h))
      await wrap(until(() => h.run.session()?.runNumber === 221, 'the run number'))
      h.clock.value = 3400

      h.model.requestFlow('pokedex')

      const body = runningBody(h.model)
      expect(body.runNumber).toBe(221)
      expect(body.elapsed).toBe('2.4s')
      expect(body.nodeId).toBe('start1')
      expect(h.model.pendingFlowName()).toBe('pokedex')
      // Still where it was: the dialog holds the target, it does not move to it.
      expect(h.flows.flowId()).toBe('publication')
      release()
    })
  })

  it('esc stays in the flow and leaves the run alone', async () => {
    const cancelRun = vi.fn(async () => true)
    const { client, release } = midRunClient({ cancelRun } as Partial<JobikClient>)
    await inFrame(client, async (h) => {
      await wrap(startRun(h))
      h.model.requestFlow('pokedex')
      expect(h.model.body()?.kind).toBe('running')

      h.model.stay()

      expect(h.model.body()).toBeUndefined()
      expect(h.model.pendingFlowId()).toBeUndefined()
      expect(h.flows.flowId()).toBe('publication')
      expect(h.run.running()).toBe(true)
      expect(cancelRun).not.toHaveBeenCalled()
      // The switch dialog is not the cancel dialog: leaving one must not open the other.
      expect(h.run.cancelPrompt()).toBe(false)
      release()
    })
  })

  it('`Switch and keep running` dismisses the dialog and cancels nothing', async () => {
    const cancelRun = vi.fn(async () => true)
    const { client, release } = midRunClient({ cancelRun } as Partial<JobikClient>)
    await inFrame(client, async (h) => {
      await wrap(startRun(h))
      h.model.requestFlow('pokedex')

      h.model.switchToPending()

      // `4A`: the dialog goes first and the flow change waits for its 120 ms departure to end.
      expect(h.model.body()).toBeUndefined()
      expect(h.model.closingFlowId()).toBe('pokedex')
      expect(h.flows.flowId()).toBe('publication')

      h.model.switchExited()

      expect(h.flows.flowId()).toBe('pokedex')
      expect(h.model.closingFlowId()).toBeUndefined()
      expect(h.run.running()).toBe(false)
      expect(cancelRun).not.toHaveBeenCalled()
      release()
    })
  })

  it('`Cancel and switch` stops the run on the server before it leaves', async () => {
    const cancelRun = vi.fn(async () => true)
    const { client, release } = midRunClient({ cancelRun } as Partial<JobikClient>)
    await inFrame(client, async (h) => {
      await wrap(startRun(h))
      await wrap(until(() => h.run.runToken() === 'tok', 'the run token'))
      h.model.requestFlow('pokedex')

      h.model.cancelAndSwitch()

      // The cancel is NOT deferred with the switch: `4A` rule 04 — a transition never delays a
      // result — and stopping the run on the server is the result. Only the flow change waits.
      expect(cancelRun).toHaveBeenCalledWith('tok')
      expect(h.model.body()).toBeUndefined()
      expect(h.flows.flowId()).toBe('publication')

      h.model.switchExited()

      // The token is the one the run was accepted with — the cancel is aimed at the run being left,
      // not at whatever `runToken` holds once the switch has cleared it.
      expect(h.flows.flowId()).toBe('pokedex')
      expect(h.run.runToken()).toBeUndefined()
      release()
    })
  })
})

describe('3F — switching away from an unsaved draft', () => {
  /** One drag, which is the smallest thing that makes the draft dirty. */
  function dirty(h: Harness): void {
    h.draft.moveNode({ nodeId: 'start1', position: { x: 64, y: -24 } })
  }

  it('asks first, on the unsaved body, counting what the draft is holding back', async () => {
    const save = vi.fn(async () => ({ revision: 'rev-2' }))
    await inFrame(twoFlowClient({ save }), async (h) => {
      dirty(h)

      h.model.requestFlow('pokedex')

      const body = unsavedBody(h.model)
      expect(body.unsavedChanges).toBe(1)
      expect(body.documentFile).toBe('flow.jobik.json')
      expect(h.model.pendingFlowName()).toBe('pokedex')
      expect(h.flows.flowId()).toBe('publication')
      expect(save).not.toHaveBeenCalled()
    })
  })

  it('esc stays in the flow and leaves the draft dirty', async () => {
    const save = vi.fn(async () => ({ revision: 'rev-2' }))
    await inFrame(twoFlowClient({ save }), async (h) => {
      dirty(h)
      h.model.requestFlow('pokedex')
      expect(h.model.body()?.kind).toBe('unsaved')

      h.model.stay()

      expect(h.model.body()).toBeUndefined()
      expect(h.flows.flowId()).toBe('publication')
      expect(h.draft.dirty()).toBe(true)
      expect(save).not.toHaveBeenCalled()
    })
  })

  it('`Discard changes` leaves the draft behind and switches once the dialog has gone', async () => {
    const save = vi.fn(async () => ({ revision: 'rev-2' }))
    await inFrame(twoFlowClient({ save }), async (h) => {
      dirty(h)
      h.model.requestFlow('pokedex')

      h.model.switchToPending()
      expect(h.model.body()).toBeUndefined()
      expect(h.flows.flowId()).toBe('publication')

      h.model.switchExited()

      expect(h.flows.flowId()).toBe('pokedex')
      expect(save).not.toHaveBeenCalled()
      await wrap(until(() => h.flows.descriptor()?.id === 'pokedex', 'the second flow'))
      expect(h.draft.dirty()).toBe(false)
    })
  })

  it('`Save and switch` writes the draft first, then switches', async () => {
    const save = vi.fn<JobikClient['save']>(async () => ({ revision: 'rev-2' }))
    await inFrame(twoFlowClient({ save }), async (h) => {
      dirty(h)
      h.model.requestFlow('pokedex')

      h.model.saveAndSwitch()
      // The target is parked for as long as the write is in flight, which is what stops a second
      // press issuing a second write against the same `baseRevision`.
      expect(h.model.saveAndSwitchTo()).toBe('pokedex')
      await wrap(until(() => h.flows.flowId() === 'pokedex', 'the switch'))

      expect(save).toHaveBeenCalledTimes(1)
      // The write went to the flow the edit was made in, against the revision it was loaded at.
      expect(save.mock.calls[0]?.[0]).toBe('publication')
      expect(save.mock.calls[0]?.[2]).toBe('rev-1')
      expect(h.model.body()).toBeUndefined()
      expect(h.model.saveAndSwitchTo()).toBeUndefined()
    })
  })

  it('`Save and switch` stays put when the write is rejected, and says why', async () => {
    const save = vi.fn(async () => CONFLICT)
    await inFrame(twoFlowClient({ save }), async (h) => {
      dirty(h)
      h.model.requestFlow('pokedex')

      h.model.saveAndSwitch()
      await wrap(until(() => h.save.state().kind === 'conflict', 'the conflict'))

      expect(h.flows.flowId()).toBe('publication')
      expect(h.draft.dirty()).toBe(true)
      expect(h.save.state()).toEqual({
        kind: 'conflict',
        expectedRevision: 'rev-1',
        actualRevision: 'rev-9',
      })
      // The dialog gets out of the way, so the conflict's own reload and copy-draft are reachable.
      expect(h.model.body()).toBeUndefined()
      expect(h.model.pendingFlowId()).toBeUndefined()
      expect(h.model.saveAndSwitchTo()).toBeUndefined()
      expect(save).toHaveBeenCalledTimes(1)
    })
  })

  /**
   * New to the model. `StudioApp` supplied this guard by hand because `studio.save()` had no
   * re-entrancy check of its own; `model/save.ts` now has one too, and this asserts the outer half
   * — a second press while the target is parked issues nothing at all.
   */
  it('issues one write however often `Save and switch` is pressed', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const save = vi.fn(async () => {
      await gate
      return { revision: 'rev-2' }
    })

    await inFrame(twoFlowClient({ save }), async (h) => {
      dirty(h)
      h.model.requestFlow('pokedex')

      h.model.saveAndSwitch()
      h.model.saveAndSwitch()
      h.model.saveAndSwitch()

      expect(save).toHaveBeenCalledTimes(1)
      release()
      await wrap(until(() => h.flows.flowId() === 'pokedex', 'the switch'))
      expect(save).toHaveBeenCalledTimes(1)
    })
  })
})

/**
 * New to the model, and the one behaviour `3F` has that no artboard draws: the dialog asks about a
 * state that can end on its own. `StudioApp` had it as a `useEffect`; here it is an `effect`
 * created inside `body`'s connect hook, so it lives exactly as long as the surface that asks the
 * question.
 */
describe('the question that answers itself', () => {
  it('switches once the run it was asking about settles', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    await inFrame(
      twoFlowClient({
        startRun: async () =>
          (async function* () {
            yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
            await gate
            yield { type: 'run-settled', report: REPORT } as RunStreamEvent
          })(),
      }),
      async (h) => {
        await wrap(startRun(h))
        h.model.requestFlow('pokedex')
        expect(h.flows.flowId()).toBe('publication')

        release()
        await wrap(until(() => h.flows.flowId() === 'pokedex', 'the switch to answer itself'))

        expect(h.model.pendingFlowId()).toBeUndefined()
        expect(h.model.body()).toBeUndefined()
      },
    )
  })

  it('stays put while the run it was asking about is still open', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    await inFrame(
      twoFlowClient({
        startRun: async () =>
          (async function* () {
            yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
            await gate
            yield { type: 'run-settled', report: REPORT } as RunStreamEvent
          })(),
      }),
      async (h) => {
        await wrap(startRun(h))
        h.model.requestFlow('pokedex')

        await wrap(macrotask())
        await wrap(macrotask())

        expect(h.flows.flowId()).toBe('publication')
        expect(h.model.pendingFlowId()).toBe('pokedex')
        release()
      },
    )
  })
})

/**
 * F-M10 — `4A`'s one explicit ordering: *"Switch-flow modal — 200 / 120 ms, and the 240 ms screen
 * change starts only after it closes."*
 *
 * The dismissal and the transition used to be one synchronous body, so the dialog vanished and the
 * canvas swapped in the same frame. They are two moments now, and what separates them is the
 * dialog's own exit rather than a timer — `SwitchFlowModal` calls `switchExited` from
 * `ModalShell`'s `onExited`, which fires when the card's measured `animation-duration` has elapsed
 * and *immediately* when that duration is zero, which is what `prefers-reduced-motion` and jsdom
 * both produce.
 */
describe('4A — the switch waits for the dialog to leave, and never for anything else', () => {
  it('commits at once when no dialog was ever asked for', async () => {
    await inFrame(twoFlowClient(), async (h) => {
      // Nothing at risk, so `requestFlow` goes straight through: there is no card to wait for and
      // parking the target would strand the switch.
      h.model.requestFlow('pokedex')

      expect(h.model.closingFlowId()).toBeUndefined()
      expect(h.flows.flowId()).toBe('pokedex')
    })
  })

  it('is a no-op if the exit is announced with nothing parked', async () => {
    await inFrame(twoFlowClient(), async (h) => {
      h.model.switchExited()
      expect(h.flows.flowId()).toBe('publication')
    })
  })

  /** `esc` during the departure must not undo a decision the user has already made. */
  it('ignores a dismissal that arrives while the card is already leaving', async () => {
    await inFrame(twoFlowClient(), async (h) => {
      h.draft.moveNode({ nodeId: 'start1', position: { x: 64, y: -24 } })
      h.model.requestFlow('pokedex')
      h.model.switchToPending()

      h.model.stay()
      expect(h.model.closingFlowId()).toBe('pokedex')

      h.model.switchExited()
      expect(h.flows.flowId()).toBe('pokedex')
    })
  })

  /**
   * The other half: a second question opened inside the exit window and then dismissed must not
   * commit the first, abandoned answer on its own way out.
   */
  it('drops a parked target when a fresh question is dismissed', async () => {
    await inFrame(twoFlowClient(), async (h) => {
      h.draft.moveNode({ nodeId: 'start1', position: { x: 64, y: -24 } })
      h.model.requestFlow('pokedex')
      h.model.switchToPending()
      expect(h.model.closingFlowId()).toBe('pokedex')

      // The draft is still dirty — nothing has been reset yet — so the dialog opens again.
      h.model.requestFlow('pokedex')
      expect(h.model.body()).toBeDefined()

      h.model.stay()
      h.model.switchExited()

      expect(h.flows.flowId()).toBe('publication')
      expect(h.model.closingFlowId()).toBeUndefined()
    })
  })
})
