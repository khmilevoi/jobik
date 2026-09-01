import type { FlowDocument } from '@jobik/core'
import { action, atom, computed, context, wrap } from '@reatom/core'
import { describe, expect, it, vi } from 'vitest'
import type { JobikClient, RunStreamEvent, WireNodeReportPayload } from '#client/index.js'
import { JobikTransportError } from '#client/index.js'
import { reatomDraft } from './draft.js'
import { reatomFlows } from './flows.js'
import { reatomInputs } from './inputs.js'
import { reatomRun } from './run.js'
import { reatomSave } from './save.js'
import { reatomShortcuts } from './shortcuts.js'
import type { OutputModel, StudioDeps } from './types.js'
import { reatomValidation } from './validation.js'

/**
 * The four global keys, driven directly inside a `context.start()` frame.
 *
 * `'validates from ⌘⇧V'`, `'closes on Escape, the artboard drawing no close control of its own'`
 * and `'sends a real number and parsed JSON to the client through ⌘↵, not raw draft strings'` are
 * ports from `studio/StudioApp/StudioApp.test.tsx` and keep their names; the rest are new to the
 * model and named for what they are. `⌘S` had no test at all before this file.
 *
 * **The sub-models are the real ones, and the client is the assertion surface.** A stub with four
 * spies would only prove that four functions were called; what the shortcut layer actually owes is
 * that `⌘↵` sends the values the draft holds, that `⌘⇧V` reaches the server, that `⌘S` writes, and
 * that `esc` picks the right one of three things to do. Each of those is a statement about the
 * client, and this harness is `model/studio.ts`'s wiring written out by hand so it can be made.
 * `output` is a stub because `model/output.ts` is another agent's file and this task never depended
 * on it; what the shortcut layer needs from it is the open viewer id and `close`.
 *
 * Every `await` inside `context.start` is `await wrap(…)`, including awaits on the helpers below: a
 * bare `await` resumes in the global context, where none of these atoms have any state at all.
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

/** The typed start `R35` was observed against: one real number and one parsed JSON value. */
const NUMERIC_DESCRIPTOR = {
  ...DESCRIPTOR,
  nodes: [
    {
      ...DESCRIPTOR.nodes[0],
      input: {
        nodeId: 'start1',
        fields: [
          {
            field: 'count',
            required: true,
            annotation: 'number',
            control: { kind: 'number' as const, integer: false },
          },
          {
            field: 'payload',
            required: true,
            annotation: 'unknown',
            control: { kind: 'json' as const, schema: {} },
          },
        ],
      },
      output: { nodeId: 'start1', fields: [] },
    },
  ],
}

/** F02's own start: one required field the empty draft cannot satisfy. */
const CONSTRAINED_DESCRIPTOR = {
  ...DESCRIPTOR,
  nodes: [
    {
      ...DESCRIPTOR.nodes[0],
      input: {
        nodeId: 'start1',
        fields: [
          {
            field: 'name',
            required: true,
            annotation: 'string',
            control: { kind: 'string' as const, minLength: 1 },
          },
        ],
      },
    },
  ],
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
    startRun: async () => new JobikTransportError({ url: '/api/runs' }),
    cancelRun: async () => true,
    assetUrl: (asset: { readonly id: string }) => `/api/assets/${asset.id}`,
    extensionBundleUrl: () => '/api/flows/publication/ui.js',
    ...overrides,
  } as unknown as JobikClient
}

/** As much of `OutputModel` as the shortcut layer can see: the open viewer, and `close`. */
function stubOutput(name: string): OutputModel {
  const viewerNodeId = atom<string | undefined>(undefined, `${name}.viewerNodeId`)
  return {
    viewerNodeId,
    openViewerNode: computed<WireNodeReportPayload | undefined>(
      () => undefined,
      `${name}.openViewerNode`,
    ),
    dockStrings: computed<{ readonly context: string; readonly summary: string } | undefined>(
      () => undefined,
      `${name}.dockStrings`,
    ),
    logs: computed<readonly { readonly time: string; readonly message: string }[]>(
      () => [],
      `${name}.logs`,
    ),
    open: action((nodeId: string) => {
      viewerNodeId.set(nodeId)
    }, `${name}.open`),
    close: action(() => {
      viewerNodeId.set(undefined)
    }, `${name}.close`),
    copyAll: action(() => {}, `${name}.copyAll`),
    download: action(() => {}, `${name}.download`),
    reset: action(() => {
      viewerNodeId.set(undefined)
    }, `${name}.reset`),
  }
}

/** `model/studio.ts`'s wiring, written out by hand, down to `shortcuts`. */
function makeHarness(client: JobikClient) {
  const clock = { value: 1000 }
  const deps: StudioDeps = { client, now: () => clock.value }

  const flows = reatomFlows(deps, 'test.flows')
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

  const model = reatomShortcuts(deps, { run, save, validation, output }, 'test.shortcuts')

  return { model, flows, draft, save, inputs, validation, run, output }
}

type Harness = ReturnType<typeof makeHarness>

/** What a mounted Studio subscribes to, plus `bound` — which is what installs the listener. */
function connect(h: Harness): () => void {
  const unsubscribe = [
    h.flows.flows.subscribe(() => {}),
    h.flows.descriptor.subscribe(() => {}),
    h.inputs.startId.subscribe(() => {}),
    h.model.bound.subscribe(() => {}),
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

/**
 * A press, as a real cancelable `KeyboardEvent` so `preventDefault()` has something to record.
 * `⌘` and `⌃` are one key here, exactly as they are in the handler.
 */
function press(key: string, modifiers: { meta?: boolean; shift?: boolean } = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key,
    metaKey: modifiers.meta ?? false,
    shiftKey: modifiers.shift ?? false,
    cancelable: true,
    bubbles: true,
  })
}

function inFrame(
  client: JobikClient,
  body: (h: Harness, off: () => void) => Promise<void>,
): Promise<void> {
  return wrap(
    context.start(async () => {
      const h = makeHarness(client)
      const off = connect(h)
      await wrap(until(() => h.flows.descriptor()?.id === 'publication', 'the flow'))
      await wrap(body(h, off))
      off()
    }),
  )
}

describe('the four global keys', () => {
  it('sends a real number and parsed JSON to the client through ⌘↵, not raw draft strings', async () => {
    const startRun = vi.fn(async (_args: { flowId: string; startId: string; input: unknown }) =>
      streamOf([{ type: 'run-accepted', runToken: 'tok' }] as RunStreamEvent[]),
    )
    await inFrame(
      stubClient({
        loadFlow: async () => ({
          descriptor: NUMERIC_DESCRIPTOR,
          document: DOCUMENT,
          revision: 'rev-1',
        }),
        startRun,
      } as unknown as Partial<JobikClient>),
      async (h) => {
        h.inputs.setInputField('count', '1024')
        h.inputs.setInputField('payload', '{"a":1}')

        const event = press('Enter', { meta: true })
        h.model.onKeyDown(event)

        expect(event.defaultPrevented).toBe(true)
        await wrap(until(() => startRun.mock.calls.length === 1, 'the run to start'))
        const args = startRun.mock.calls[0]?.[0] as { input: Record<string, unknown> }
        expect(args.input).toEqual({ count: 1024, payload: { a: 1 } })
      },
    )
  })

  /**
   * F02, from the one affordance that never touched `onInvalid` at all: `⌘↵` is not the panel's
   * button, so a required field left empty used to be a completely silent no-op.
   */
  it('reports the same way for ⌘↵, which never touched onInvalid at all', async () => {
    const startRun = vi.fn(async () => streamOf([]))
    await inFrame(
      stubClient({
        loadFlow: async () => ({
          descriptor: CONSTRAINED_DESCRIPTOR,
          document: DOCUMENT,
          revision: 'rev-1',
        }),
        startRun,
      } as unknown as Partial<JobikClient>),
      async (h) => {
        h.model.onKeyDown(press('Enter', { meta: true }))

        expect(h.inputs.issues()?.map((issue) => issue.path)).toEqual(['name'])
        expect(startRun).not.toHaveBeenCalled()
        expect(h.run.running()).toBe(false)
      },
    )
  })

  /**
   * New to the model. The hook guarded `⌘↵` on `running` and on a start node; `run.start` owns the
   * second half now, and this is the first — a press during a run must not even reach the draft, or
   * it would file an F02 finding about a run nobody asked for.
   */
  it('starts nothing from ⌘↵ while a run is in flight', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const startRun = vi.fn(async () =>
      (async function* () {
        yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
        await gate
        yield { type: 'run-settled', report: REPORT } as RunStreamEvent
      })(),
    )

    await inFrame(stubClient({ startRun } as unknown as Partial<JobikClient>), async (h) => {
      h.inputs.setInputField('title', 't')
      h.model.onKeyDown(press('Enter', { meta: true }))
      await wrap(until(() => h.run.running(), 'the run to open'))

      h.model.onKeyDown(press('Enter', { meta: true }))

      expect(startRun).toHaveBeenCalledTimes(1)
      expect(h.inputs.issues()).toBeUndefined()
      release()
    })
  })

  it('validates from ⌘⇧V', async () => {
    const validate = vi.fn(async () => ({ valid: true }) as const)
    await inFrame(stubClient({ validate }), async (h) => {
      const event = press('v', { meta: true, shift: true })
      h.model.onKeyDown(event)

      expect(event.defaultPrevented).toBe(true)
      expect(h.validation.chip()).toBe('checking')
      await wrap(until(() => validate.mock.calls.length === 1, 'the check'))
      await wrap(until(() => h.validation.state()?.kind === 'valid', 'the passing answer'))
    })
  })

  /**
   * New to the model: `⌘S` is drawn nowhere and was bound in `StudioApp` with no test behind it at
   * all. `save()` answers its own refusals, so this layer adds no guard and asserts none.
   */
  it('writes the draft from ⌘S', async () => {
    const save = vi.fn(async () => ({ revision: 'rev-2' }))
    await inFrame(stubClient({ save }), async (h) => {
      h.draft.moveNode({ nodeId: 'start1', position: { x: 5, y: 5 } })
      expect(h.draft.dirty()).toBe(true)

      const event = press('s', { meta: true })
      h.model.onKeyDown(event)

      expect(event.defaultPrevented).toBe(true)
      await wrap(until(() => save.mock.calls.length === 1, 'the write'))
      await wrap(until(() => !h.draft.dirty(), 'the draft to be adopted'))
      expect(save.mock.calls[0]?.[0]).toBe('publication')
    })
  })

  it('closes on Escape, the artboard drawing no close control of its own', async () => {
    await inFrame(stubClient(), async (h) => {
      h.output.open('start1')

      h.model.onKeyDown(press('Escape'))

      expect(h.output.viewerNodeId()).toBeUndefined()
      // The viewer takes priority over cancelling: it only ever opens once a run has settled.
      expect(h.run.cancelPrompt()).toBe(false)
    })
  })

  /**
   * New to the model, and `3C`'s own rule: every affordance that used to cancel now asks, and only
   * the dialog's destructive primary sends the request.
   */
  it('asks before cancelling when esc lands on a run in flight', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const cancelRun = vi.fn(async () => true)
    const startRun = vi.fn(async () =>
      (async function* () {
        yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
        await gate
        yield { type: 'run-settled', report: REPORT } as RunStreamEvent
      })(),
    )

    await inFrame(
      stubClient({ startRun, cancelRun } as unknown as Partial<JobikClient>),
      async (h) => {
        h.inputs.setInputField('title', 't')
        h.model.onKeyDown(press('Enter', { meta: true }))
        await wrap(until(() => h.run.running(), 'the run to open'))

        h.model.onKeyDown(press('Escape'))

        expect(h.run.cancelPrompt()).toBe(true)
        expect(cancelRun).not.toHaveBeenCalled()
        release()
      },
    )
  })

  /**
   * New to the model, and the reason the `esc` order starts where it does. A modal that answered
   * the press has called `preventDefault()` on the way up (see `ModalShell`); without this,
   * dismissing `3F`'s dialog while a run streamed also opened `Cancel run #221?` off the same
   * press, and `esc` out of that one re-opened it forever.
   */
  it('leaves an esc a modal has already answered alone', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const startRun = vi.fn(async () =>
      (async function* () {
        yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
        await gate
        yield { type: 'run-settled', report: REPORT } as RunStreamEvent
      })(),
    )

    await inFrame(stubClient({ startRun } as unknown as Partial<JobikClient>), async (h) => {
      h.inputs.setInputField('title', 't')
      h.model.onKeyDown(press('Enter', { meta: true }))
      await wrap(until(() => h.run.running(), 'the run to open'))
      h.output.open('start1')

      const answered = press('Escape')
      answered.preventDefault()
      h.model.onKeyDown(answered)

      expect(h.output.viewerNodeId()).toBe('start1')
      expect(h.run.cancelPrompt()).toBe(false)
      release()
    })
  })

  /** A key the Studio does not bind reaches nothing, and is never swallowed. */
  it('leaves every other press alone', async () => {
    const save = vi.fn(async () => ({ revision: 'rev-2' }))
    const validate = vi.fn(async () => ({ valid: true }) as const)
    await inFrame(stubClient({ save, validate }), async (h) => {
      const event = press('k', { meta: true })
      h.model.onKeyDown(event)

      expect(event.defaultPrevented).toBe(false)
      expect(save).not.toHaveBeenCalled()
      expect(validate).not.toHaveBeenCalled()
    })
  })
})

/**
 * RTM-L01: the listener's lifetime is the connection to `bound`, and nothing else. These two are
 * the whole of what a `useEffect` holding an `addEventListener`/`removeEventListener` pair used to
 * promise, asserted through a real dispatch rather than through the handler.
 */
describe('the global listener', () => {
  it('binds keydown while something is connected, and unbinds it after', async () => {
    const validate = vi.fn(async () => ({ valid: true }) as const)
    await wrap(
      context.start(async () => {
        const h = makeHarness(stubClient({ validate }))
        expect(h.model.bound()).toBe(false)

        const off = connect(h)
        await wrap(until(() => h.flows.descriptor()?.id === 'publication', 'the flow'))
        expect(h.model.bound()).toBe(true)

        globalThis.dispatchEvent(press('v', { meta: true, shift: true }))
        await wrap(until(() => validate.mock.calls.length === 1, 'the check'))

        off()
        // A disconnect is scheduled rather than immediate, so the cleanup that unbinds the
        // listener and writes `bound` runs a tick after the last subscriber leaves.
        await wrap(until(() => !h.model.bound(), 'the listener to be unbound'))

        globalThis.dispatchEvent(press('v', { meta: true, shift: true }))
        await wrap(macrotask())
        expect(validate).toHaveBeenCalledTimes(1)
      }),
    )
  })
})
