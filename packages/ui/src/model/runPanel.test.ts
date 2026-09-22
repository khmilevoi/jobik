import type { FlowDocument } from '@jobik/core'
import type { Atom, Computed } from '@reatom/core'
import { action, atom, computed, context, sleep, withComputed, wrap } from '@reatom/core'
import { describe, expect, it, vi } from 'vitest'
import type {
  JobikClient,
  RunStreamEvent,
  SafeFlowDescriptorPayload,
  SafeNodeDescriptorPayload,
  WireRunReportPayload,
} from '#client/index.js'
import { JobikTransportError } from '#client/index.js'
import type {
  RunCompletedState,
  RunFailedState,
  RunIdleState,
  RunInputDraft,
  RunInputDraftValue,
  RunInputIssue,
  RunPanelState,
  RunRunningState,
} from '#run/index.js'
import { toRunInputIssues, validateRunInputs } from '#run/index.js'
import {
  initialRunInputDraft,
  runInputPresentation,
  toRunInputSchema,
} from '#studio/inputSchema.js'
import { reatomRun } from './run.js'
import { reatomRunPanel } from './runPanel.js'
import type { InputsModel, RunModel, RunPanelModel } from './types.js'

/**
 * The run panel's derived data, driven directly rather than through a component.
 *
 * Every case that carries a name from `studio/StudioApp/StudioApp.test.tsx` keeps that name, so the
 * two files can be read side by side until that one is rewritten; the cases that are new to the
 * model — the split the 100ms tick made necessary, and `dockStatus`, which no `StudioApp` case ever
 * asserted — are grouped apart at the end and named for what they are. Nothing was ported by
 * weakening it: where a `StudioApp` case asserted a DOM fact as well as a derived one, the derived
 * half is asserted here and the comment on the case says what stayed behind.
 *
 * `useStudioSession.test.ts` contributed no case: everything it asserted about a run was about the
 * SESSION — the stream, the archive, the cancel race — and T1.1 ported all of it into
 * `model/run.test.ts`. The panel's own projection never lived in that file.
 *
 * The shape is `context.start(async …)` with every continuation crossing `wrap`, which is what a
 * Reatom frame needs. There is no `renderHook` and no `act`.
 */

const DOCUMENT = {
  format: 'jobik.flow',
  version: 1,
  connections: [
    { from: { node: 'start1', field: 'title' }, to: { node: 'render', field: 'title' } },
  ],
  literals: {},
  layout: { start1: { x: 56, y: 248 }, render: { x: 386, y: 150 } },
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
    {
      id: 'render',
      kind: 'transform' as const,
      title: 'imageOut',
      input: {
        nodeId: 'render',
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
        nodeId: 'render',
        fields: [
          { field: 'image', required: true, annotation: 'Buffer', asset: { mime: 'image/png' } },
        ],
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
    {
      nodeId: 'render',
      status: 'ok' as const,
      elapsedMs: 2100,
      output: {},
      assets: {
        image: { type: 'Buffer' as const, mime: 'image/png', bytes: 412_000, id: 'asset-1' },
      },
      error: null,
    },
  ],
  logs: [{ nodeId: 'render', message: 'layout pass complete', at: 310 }],
  error: null,
} as unknown as WireRunReportPayload

const IMAGE_RENDER_ERROR = {
  _tag: 'ImageRenderError',
  message: 'Unsupported colour profile in the inlined asset.',
  authored: true,
}

const FAILED_REPORT = {
  ...REPORT,
  status: 'failed' as const,
  elapsedMs: 800,
  nodes: [
    REPORT.nodes[0],
    {
      nodeId: 'render',
      status: 'failed' as const,
      elapsedMs: 800,
      output: null,
      assets: {},
      error: IMAGE_RENDER_ERROR,
    },
  ],
} as unknown as WireRunReportPayload

/**
 * R7's fixture — a run the user cancelled. `RunCancelledError` is what the engine settles it with,
 * and `status` is the report's own third arm, which `model/toast.ts` has read all along.
 */
const CANCELLED_REPORT = {
  ...REPORT,
  status: 'cancelled' as const,
  elapsedMs: 500,
  error: { _tag: 'RunCancelledError', message: 'The run was cancelled' },
} as unknown as WireRunReportPayload

/** F02's fixture: a start whose one field the empty draft cannot satisfy. */
const CONSTRAINED_DESCRIPTOR = {
  ...DESCRIPTOR,
  nodes: [
    {
      id: 'start1',
      kind: 'start' as const,
      title: 'start',
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
      output: {
        nodeId: 'start1',
        fields: [{ field: 'name', required: true, annotation: 'string' }],
      },
    },
  ],
} as unknown as SafeFlowDescriptorPayload

/** F07's fixture: two starts whose pipelines share a document and not one node. */
const POKEDEX_DOCUMENT = {
  format: 'jobik.flow',
  version: 1,
  connections: [],
  literals: {},
  layout: { byName: { x: 0, y: 0 }, byNumber: { x: 0, y: 120 } },
} as unknown as FlowDocument

const POKEDEX_DESCRIPTOR = {
  id: 'pokedex',
  name: 'pokedex',
  documentFile: 'flow.jobik.json',
  sourceFile: 'index.ts',
  startIds: ['byName', 'byNumber'],
  nodes: [
    {
      id: 'byName',
      kind: 'start' as const,
      title: 'byName',
      input: {
        nodeId: 'byName',
        fields: [
          {
            field: 'name',
            required: true,
            annotation: 'string',
            control: { kind: 'string' as const },
          },
        ],
      },
      output: { nodeId: 'byName', fields: [] },
    },
    {
      id: 'byNumber',
      kind: 'start' as const,
      title: 'byNumber',
      input: {
        nodeId: 'byNumber',
        fields: [
          {
            field: 'number',
            required: true,
            annotation: 'number',
            default: 25,
            control: { kind: 'number' as const, integer: true },
          },
        ],
      },
      output: { nodeId: 'byNumber', fields: [] },
    },
  ],
} as unknown as SafeFlowDescriptorPayload

const POKEDEX_REPORT = {
  flowName: 'pokedex',
  startId: 'byName',
  runNumber: 7,
  status: 'ok' as const,
  elapsedMs: 2400,
  nodes: [
    { nodeId: 'byName', status: 'ok' as const, elapsedMs: 10, output: {}, assets: {}, error: null },
  ],
  logs: [],
  error: null,
} as unknown as WireRunReportPayload

const POKEDEX_FAILURE = {
  ...POKEDEX_REPORT,
  runNumber: 8,
  status: 'failed' as const,
  nodes: [
    {
      nodeId: 'byName',
      status: 'failed' as const,
      elapsedMs: 10,
      output: null,
      assets: {},
      error: { _tag: 'NodeHandlerError', message: 'pokeapi said no' },
    },
  ],
  error: { _tag: 'NodeHandlerError', message: 'pokeapi said no' },
} as unknown as WireRunReportPayload

function streamOf(events: readonly RunStreamEvent[]) {
  return (async function* () {
    for (const event of events) yield event
  })()
}

function stubClient(overrides: Partial<JobikClient> = {}): JobikClient {
  return {
    listFlows: async () => [{ id: 'publication', name: 'publication', nodeCount: 2 }],
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
 * An {@link InputsModel} built out of plain units, standing in for `model/inputs.ts`.
 *
 * The panel takes the whole sub-model and this file never imports it: `reatomInputs` is another
 * agent's, and the panel's contract is with the interface rather than with that factory. The three
 * pure helpers it shares — `toRunInputSchema`, `runInputPresentation`, `initialRunInputDraft` — are
 * `studio/inputSchema.ts`'s and are the same ones the real model reuses, so the panel is fed the
 * values it will really be fed.
 */
function makeInputs(
  descriptor: Computed<SafeFlowDescriptorPayload | undefined>,
  startId: Atom<string | undefined>,
  locked: Computed<boolean>,
): InputsModel {
  const selectedNodeId = atom<string | undefined>(undefined, 'test.inputs.selectedNodeId')
  const issues = atom<readonly RunInputIssue[] | undefined>(undefined, 'test.inputs.issues')

  const startNode = computed<SafeNodeDescriptorPayload | undefined>(() => {
    const current = descriptor()
    const start = startId()
    if (current === undefined || start === undefined) return undefined
    return current.nodes.find((node) => node.id === start)
  }, 'test.inputs.startNode')

  const inputDraft = atom<RunInputDraft>({}, 'test.inputs.draft').extend(
    withComputed(() => {
      const node = startNode()
      return node === undefined ? {} : initialRunInputDraft(node.input)
    }),
  )

  const schema = computed(() => {
    const node = startNode()
    return node === undefined ? undefined : toRunInputSchema(node.input)
  }, 'test.inputs.schema')

  const presentation = computed(() => {
    const node = startNode()
    return node === undefined ? undefined : runInputPresentation(node.input, inputDraft())
  }, 'test.inputs.presentation')

  const setInputField = action((field: string, value: RunInputDraftValue) => {
    if (locked()) return
    inputDraft.set({ ...inputDraft(), [field]: value })
    issues.set(undefined)
  }, 'test.inputs.setInputField')

  const seedStart = action((_descriptor: SafeFlowDescriptorPayload, start: string | undefined) => {
    startId.set(start)
    selectedNodeId.set(start)
    issues.set(undefined)
  }, 'test.inputs.seedStart')

  const selectStart = action((next: string) => {
    if (locked()) return
    const current = descriptor()
    if (current === undefined || !current.startIds.includes(next)) return
    seedStart(current, next)
  }, 'test.inputs.selectStart')

  const values = action((): Record<string, unknown> | undefined => {
    const node = startNode()
    const input = schema()
    if (node === undefined || input === undefined) return undefined
    const collected = validateRunInputs({ input, fields: node.input.fields, draft: inputDraft() })
    if (collected instanceof Error) {
      issues.set(toRunInputIssues(collected))
      return undefined
    }
    issues.set(undefined)
    return collected
  }, 'test.inputs.values')

  const reportInvalid = action((error: Error) => {
    issues.set(toRunInputIssues(error))
  }, 'test.inputs.reportInvalid')

  const reset = action(() => {
    startId.set(undefined)
    selectedNodeId.set(undefined)
    issues.set(undefined)
  }, 'test.inputs.reset')

  return {
    startId,
    selectedNodeId,
    startNode,
    inputDraft,
    schema,
    presentation,
    uploads: computed(() => ({}), 'test.inputs.uploads'),
    uploading: computed(() => false, 'test.inputs.uploading'),
    issues,
    setInputField,
    selectStart,
    seedStart,
    values,
    reportInvalid,
    reset,
  }
}

interface Harness {
  readonly panel: RunPanelModel
  readonly run: RunModel
  readonly inputs: InputsModel
  readonly descriptor: Atom<SafeFlowDescriptorPayload | undefined>
  readonly blocked: Atom<boolean>
  /** The injected clock, movable so the running readout has something to print. */
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
  const descriptor = atom<SafeFlowDescriptorPayload | undefined>(
    seed.descriptor ?? DESCRIPTOR,
    'test.descriptor',
  )
  const descriptorInput = computed(() => descriptor(), 'test.descriptorInput')
  const flowId = atom<string | undefined>(seed.flowId ?? 'publication', 'test.flowId')
  const startId = atom<string | undefined>(seed.startId ?? 'start1', 'test.startId')
  const savedDocument = atom<FlowDocument | undefined>(seed.document ?? DOCUMENT, 'test.document')
  const blocked = atom(false, 'test.blocked')
  const blockedInput = computed(() => blocked(), 'test.blockedInput')

  // `studio.ts`'s own shape for the `locked` cycle: a lazily-read `computed` declared before the
  // model it names, so `inputs` can guard on a run that does not exist yet.
  let runModel: RunModel | undefined
  const locked = computed(() => runModel?.running() ?? false, 'test.locked')

  const inputs = makeInputs(descriptorInput, startId, locked)
  const clock = { value: 1000 }
  const deps = { client, now: () => clock.value }

  const run = reatomRun(
    deps,
    {
      flowId,
      descriptor: descriptorInput,
      startId,
      savedDocument: computed(() => savedDocument(), 'test.savedDocumentInput'),
      inputValues: inputs.values,
      inputIssues: inputs.issues,
      blocked: blockedInput,
    },
    'test.run',
  )
  runModel = run

  const panel = reatomRunPanel(
    deps,
    { descriptor: descriptorInput, inputs, run, blocked: blockedInput },
    'test.runPanel',
  )

  return { panel, run, inputs, descriptor, blocked, clock }
}

/** One isolated Reatom frame per case, which is what `context.start` is for. */
function inFrame(body: (harness: Harness) => Promise<void>, harness: () => Harness): Promise<void> {
  return wrap(context.start(async () => body(harness())))
}

/** A macrotask boundary, so every microtask hop a released gate drives has already run. */
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

function idleOf(state: RunPanelState | undefined): RunIdleState {
  if (state?.kind !== 'idle') throw new Error(`expected idle, got ${state?.kind ?? 'nothing'}`)
  return state
}

function runningOf(state: RunPanelState | undefined): RunRunningState {
  if (state?.kind !== 'running')
    throw new Error(`expected running, got ${state?.kind ?? 'nothing'}`)
  return state
}

function failedOf(state: RunPanelState | undefined): RunFailedState {
  if (state?.kind !== 'failed') throw new Error(`expected failed, got ${state?.kind ?? 'nothing'}`)
  return state
}

function completedOf(state: RunPanelState | undefined): RunCompletedState {
  if (state?.kind !== 'completed') {
    throw new Error(`expected completed, got ${state?.kind ?? 'nothing'}`)
  }
  return state
}

describe('the idle panel', () => {
  // The DOM half — one `run-input-<field>` control per declared field — belongs to `RunIdleView`,
  // which is fixture-driven and already tested. What the panel owes is the descriptor those
  // controls are drawn from, the schema they are checked against, and the button's own handler.
  it('opens on the idle run panel with a control per start input field', async () => {
    await inFrame(
      async ({ panel }) => {
        const state = idleOf(panel.state())

        expect(state.entryNodeId).toBe('start1')
        expect(state.descriptor.fields.map((field) => field.field)).toEqual(['title'])
        expect(state.draft).toEqual({ title: '' })
        expect(Object.keys(state.input.shape)).toEqual(['title'])
        expect(state.onRun).toBeTypeOf('function')
        expect(state.note).toContain('Inputs are typed from the flow declaration')
      },
      () => makeHarness(stubClient()),
    )
  })

  it('heads the idle dock with the chevron and no run number', async () => {
    await inFrame(
      async ({ panel }) => {
        // No run number and no settled state: the dock draws its collapse chevron and nothing else.
        expect(panel.meta()).toBeUndefined()
        expect(panel.dockStatus()).toBeUndefined()
      },
      () => makeHarness(stubClient()),
    )
  })

  it('blocks Run while an error stands, and lets it through once the flow is valid again', async () => {
    const startRun = vi.fn(async () => streamOf([{ type: 'run-accepted' as const, runToken: 't' }]))
    await inFrame(
      async ({ panel, blocked, run }) => {
        blocked.set(true)
        expect(idleOf(panel.state()).blocked).toBe(true)

        // The idle panel's own button hands its values to `onRun`, which is `run.start` — and `3D`
        // is the guard behind all five affordances, so nothing reaches the client.
        idleOf(panel.state()).onRun?.({ title: 'A post' })
        await flush()
        expect(startRun).not.toHaveBeenCalled()

        blocked.set(false)
        expect(idleOf(panel.state()).blocked).toBe(false)
        await wrap(run.start({ title: 'A post' }))
        expect(startRun).toHaveBeenCalledTimes(1)
      },
      () => makeHarness(stubClient({ startRun })),
    )
  })
})

describe('running from the panel', () => {
  it('shows the running panel note transcribed from the artboard', async () => {
    const streamGate = gate()
    await inFrame(
      async ({ panel, run }) => {
        const pending = run.start({ title: 'A post' })
        await flush()

        expect(runningOf(panel.state()).note).toBe(
          'Streaming output as each node settles. Inputs are locked for the duration of the run.',
        )

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

  // R38: `## Verification` names the live log; nothing streamed a `node-log` event into the panel's
  // own projection before this.
  it('streams a node-log event into the running panel', async () => {
    const streamGate = gate()
    await inFrame(
      async ({ panel, run }) => {
        const pending = run.start({ title: 'A post' })
        await flush()

        const log = runningOf(panel.state()).log
        expect(log?.lines.map((line) => line.text)).toEqual(['render layout pass complete'])
        expect(log?.followLabel).toBe('follow')
        expect(runningOf(panel.state()).partialOutput).toBe(true)

        streamGate.release()
        await wrap(pending)
      },
      () =>
        makeHarness(
          stubClient({
            startRun: async () =>
              (async function* () {
                yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
                yield {
                  type: 'node-log',
                  line: { nodeId: 'render', message: 'layout pass complete', at: 0 },
                } as RunStreamEvent
                await streamGate.promise
                yield { type: 'run-settled', report: REPORT } as RunStreamEvent
              })(),
          }),
        ),
    )
  })

  // 8-A: `Studio — run in progress` replaces the dock header's chevron with the run number; the
  // standalone settled cards add the elapsed after it.
  it('replaces the dock header’s chevron with the run number, then the settled meta', async () => {
    const streamGate = gate()
    await inFrame(
      async ({ panel, run }) => {
        const pending = run.start({ title: 'A post' })
        await flush()

        expect(panel.meta()).toEqual({ text: '#219', tone: 'normal' })

        streamGate.release()
        await wrap(pending)

        expect(panel.meta()).toEqual({ text: '#219 · 2.4s', tone: 'normal' })
      },
      () =>
        makeHarness(
          stubClient({
            startRun: async () =>
              (async function* () {
                yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
                yield {
                  type: 'run-started',
                  runNumber: 219,
                  flowName: 'publication',
                  startId: 'start1',
                  nodeCount: 2,
                } as RunStreamEvent
                await streamGate.promise
                yield { type: 'run-settled', report: REPORT } as RunStreamEvent
              })(),
          }),
        ),
    )
  })

  // `2A`'s completed panel: node timings, the inputs still editable, `Re-run start1`, then the
  // `Log` block. The run's outputs are deliberately NOT here (R8, retired) — they live only in the
  // bottom output dock, which now opens itself once the run settles successfully. The `no nested
  // card` half of the original name is `RunPanel`'s own structure and stays in `StudioApp.test.tsx`.
  it('streams to a completed panel with no outputs of its own, docked with no nested card', async () => {
    await inFrame(
      async ({ panel, run }) => {
        await wrap(run.start({ title: 'A post' }))

        const state = completedOf(panel.state())
        expect(state.runNumber).toBe(219)
        expect(state.elapsed).toBe('2.4s')
        expect(state.entryNodeId).toBe('start1')
        expect(state.nodes).toEqual([
          { nodeId: 'start1', status: 'ok', elapsed: '0.0s' },
          { nodeId: 'render', status: 'ok', elapsed: '2.1s' },
        ])
        expect(state.log?.followLabel).toBe('tail')
        expect(state.log?.lines.map((line) => line.text)).toEqual(['render layout pass complete'])
        expect(state.inputs?.draft).toEqual({ title: '' })
        expect(panel.dockStatus()).toBe('completed')
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
                  nodeCount: 2,
                },
                { type: 'run-settled', report: REPORT },
              ]),
          }),
        ),
    )
  })

  it('renders the failed panel with the tag and message the server sent', async () => {
    await inFrame(
      async ({ panel, run }) => {
        await wrap(run.start({ title: 'A post' }))

        const state = failedOf(panel.state())
        expect(state.error.name).toBe('ImageRenderError')
        expect(state.error.nodeId).toBe('render')
        expect(state.error.message).toContain('Unsupported colour profile')
        expect(panel.dockStatus()).toBe('failed')
        expect(panel.meta()).toEqual({ text: '#219 · 0.8s', tone: 'failed' })
      },
      () =>
        makeHarness(
          stubClient({
            startRun: async () =>
              streamOf([
                { type: 'run-accepted', runToken: 'tok' },
                { type: 'run-settled', report: FAILED_REPORT },
              ]),
          }),
        ),
    )
  })

  /**
   * R7 — the same settled card, for a run the user stopped rather than one that broke.
   *
   * The acceptance pass measured this run saying `Run #4 cancelled` in the toast, `#4 failed` in
   * the history row and `Run failed` in this header, all at once. The report has carried the third
   * status all along; the panel is what collapsed it.
   */
  it('reports a cancelled run as cancelled, and not in the failed tone', async () => {
    await inFrame(
      async ({ panel, run }) => {
        await wrap(run.start({ title: 'A post' }))

        const state = failedOf(panel.state())
        expect(state.cancelled).toBe(true)
        expect(state.error.name).toBe('RunCancelledError')
        expect(panel.dockStatus()).toBe('cancelled')
        expect(panel.meta()).toEqual({ text: '#219 · 0.5s', tone: 'normal' })
      },
      () =>
        makeHarness(
          stubClient({
            startRun: async () =>
              streamOf([
                { type: 'run-accepted', runToken: 'tok' },
                { type: 'run-settled', report: CANCELLED_REPORT },
              ]),
          }),
        ),
    )
  })

  it('keeps the input that produced the failure visible and editable on the failed panel', async () => {
    await inFrame(
      async ({ panel, inputs, run }) => {
        inputs.setInputField('title', 'A post')
        await wrap(run.start({ title: 'A post' }))

        const state = failedOf(panel.state())
        expect(state.inputs?.draft).toEqual({ title: 'A post' })

        state.inputs?.onDraftChange?.('title', 'A post, edited')
        expect(failedOf(panel.state()).inputs?.draft).toEqual({ title: 'A post, edited' })
      },
      () =>
        makeHarness(
          stubClient({
            startRun: async () =>
              streamOf([
                { type: 'run-accepted', runToken: 'tok' },
                { type: 'run-settled', report: FAILED_REPORT },
              ]),
          }),
        ),
    )
  })
})

// R32: the panel reads `session.failure` — the surface every run failure now arrives on, including
// these two, which never produce a `report` at all. Both must fail against a panel that ignores
// `session.failure` and only reaches the failed body through a `run-settled` report.
describe('a run failure that never produces a report', () => {
  it('renders the failed panel from a rejected start, with an empty node id', async () => {
    await inFrame(
      async ({ panel, run }) => {
        await wrap(run.start({ title: 'A post' }))

        const state = failedOf(panel.state())
        expect(state.error.name).toBe('JobikTransportError')
        expect(state.error.nodeId).toBe('')
        expect(state.error.message).toContain('could not be reached')
      },
      () =>
        makeHarness(
          stubClient({
            startRun: async () => new JobikTransportError({ url: '/api/flows/publication/run' }),
          }),
        ),
    )
  })

  it('renders the failed panel when the stream drops with no terminal event', async () => {
    await inFrame(
      async ({ panel, run }) => {
        await wrap(run.start({ title: 'A post' }))

        const state = failedOf(panel.state())
        expect(state.error.name).toBe('Error')
        expect(state.error.nodeId).toBe('')
        expect(state.error.message).toContain('connection to the server closed')
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
                  nodeCount: 2,
                },
              ]),
          }),
        ),
    )
  })
})

describe('F02: a draft the start schema rejects', () => {
  it('names the offending field in the run panel instead of doing nothing, and starts no run', async () => {
    const startRun = vi.fn(async () => streamOf([{ type: 'run-accepted' as const, runToken: 't' }]))
    await inFrame(
      async ({ panel, run }) => {
        // The four affordances outside the panel all route through `values()`; the panel's own
        // button validates inside `run/` and reports through `onInvalid`, which is the same
        // surface — `issues` on the very next idle state.
        run.runFromDraft()
        await flush()

        const state = idleOf(panel.state())
        expect(state.issues?.map((issue) => issue.path)).toEqual(['name'])
        expect((state.issues?.[0]?.message ?? '').length).toBeGreaterThan(0)
        expect(startRun).not.toHaveBeenCalled()

        state.onInvalid?.(new Error('the panel’s own button says so'))
        expect(idleOf(panel.state()).issues).toEqual([
          { path: '', message: 'the panel’s own button says so' },
        ])
      },
      () => makeHarness(stubClient({ startRun }), { descriptor: CONSTRAINED_DESCRIPTOR }),
    )
  })
})

/**
 * F07 — a multi-start flow used to lose its entry-point chooser after the first run, permanently.
 *
 * The chooser itself is the sidebar's and stays in `StudioApp.test.tsx`; the behaviour it drives is
 * the panel's, and that is what is asserted here: a report about `byName` is not a report about
 * `byNumber`, so moving the start re-arms the panel to idle with the other start's own draft while
 * the archive it was built from survives.
 */
describe('F07: choosing another start after a run has settled', () => {
  function pokedex(report: WireRunReportPayload): Harness {
    return makeHarness(
      stubClient({
        startRun: async () =>
          streamOf([
            { type: 'run-accepted', runToken: 'tok' },
            { type: 'run-settled', report },
          ]),
      }),
      {
        flowId: 'pokedex',
        descriptor: POKEDEX_DESCRIPTOR,
        document: POKEDEX_DOCUMENT,
        startId: 'byName',
      },
    )
  }

  it('keeps the sidebar’s Start section on a completed panel and re-arms for the start it is moved to', async () => {
    await inFrame(
      async ({ panel, inputs, run }) => {
        inputs.setInputField('name', 'pikachu')
        await wrap(run.start({ name: 'pikachu' }))
        expect(completedOf(panel.state()).runNumber).toBe(7)

        inputs.selectStart('byNumber')

        const state = idleOf(panel.state())
        expect(state.entryNodeId).toBe('byNumber')
        expect(state.draft).toEqual({ number: '25' })
        expect(state.descriptor.fields.map((field) => field.field)).toEqual(['number'])
      },
      () => pokedex(POKEDEX_REPORT),
    )
  })

  it('keeps the run-history archive across the switch', async () => {
    await inFrame(
      async ({ panel, inputs, run }) => {
        inputs.setInputField('name', 'pikachu')
        await wrap(run.start({ name: 'pikachu' }))

        inputs.selectStart('byNumber')

        expect(run.history().map((entry) => entry.id)).toEqual(['7'])
        // And the run is still summarised where the idle panel puts it.
        expect(idleOf(panel.state()).lastRun?.status).toBe('completed')
        expect(idleOf(panel.state()).lastRun?.totalElapsed).toBe('2.4s')
      },
      () => pokedex(POKEDEX_REPORT),
    )
  })

  it('keeps the sidebar’s Start section on a failed panel too, and re-arms from there', async () => {
    await inFrame(
      async ({ panel, inputs, run }) => {
        inputs.setInputField('name', 'pikachu')
        await wrap(run.start({ name: 'pikachu' }))
        expect(failedOf(panel.state()).error.name).toBe('NodeHandlerError')

        inputs.selectStart('byNumber')

        expect(idleOf(panel.state()).entryNodeId).toBe('byNumber')
        expect(run.history().map((entry) => entry.id)).toEqual(['8'])
      },
      () => pokedex(POKEDEX_FAILURE),
    )
  })

  it('still shows a settled run of the start it is on, and a row picked from the history', async () => {
    await inFrame(
      async ({ panel, inputs, run }) => {
        inputs.setInputField('name', 'pikachu')
        await wrap(run.start({ name: 'pikachu' }))

        inputs.selectStart('byNumber')
        expect(panel.state()?.kind).toBe('idle')

        // The row is still a way back to the run itself — the gate is about the panel's default
        // view, not about what a deliberate pick may show.
        run.selectRun('7')
        expect(completedOf(panel.state()).runNumber).toBe(7)
      },
      () => pokedex(POKEDEX_REPORT),
    )
  })
})

/**
 * The split this module exists for.
 *
 * `StudioApp.runPanelState` was one `useMemo` that named `studio.elapsedMs` among its dependencies,
 * so it re-mapped the whole run log and every node timing ten times a second for the length of a
 * run. These are the cases that pin the fix; Wave 5 asserts the same property from the surface.
 */
describe('the 100ms clock and the panel it must not rebuild', () => {
  it('a tick invalidates neither the run log nor any node timing', async () => {
    const streamGate = gate()
    await inFrame(
      async ({ panel, run, clock }) => {
        const pending = run.start({ title: 'A post' })
        await flush()

        // Subscribed, because the caches these assertions are about are the connected graph's —
        // and because `run.elapsedMs`'s connect hook is what starts the 100ms loop at all.
        const metas: unknown[] = []
        const stopMeta = panel.meta.subscribe((value) => metas.push(value))
        const stopState = panel.state.subscribe(() => {})

        const before = runningOf(panel.state())
        clock.value = 2200
        await wrap(sleep(260))
        const after = runningOf(panel.state())

        // Guards against passing vacuously: the clock really did advance and the panel really did
        // reprint it.
        expect(before.elapsed).toBe('0.0s')
        expect(after.elapsed).toBe('1.2s')

        // ...and neither projection was rebuilt to do it. A recomputation would have produced a
        // fresh array and a fresh log object, which is exactly the 10 Hz work being removed.
        expect(after.nodes).toBe(before.nodes)
        expect(after.log).toBe(before.log)

        // The dock header does not carry the clock while a run is in flight, so it published `#219`
        // once and nothing since.
        expect(metas).toEqual([{ text: '#219', tone: 'normal' }])

        stopState()
        stopMeta()
        streamGate.release()
        await wrap(pending)
      },
      () =>
        makeHarness(
          stubClient({
            startRun: async () =>
              (async function* () {
                yield { type: 'run-accepted', runToken: 'tok' } as RunStreamEvent
                yield {
                  type: 'run-started',
                  runNumber: 219,
                  flowName: 'publication',
                  startId: 'start1',
                  nodeCount: 2,
                } as RunStreamEvent
                yield {
                  type: 'node-log',
                  line: { nodeId: 'render', message: 'layout pass complete', at: 0 },
                } as RunStreamEvent
                await streamGate.promise
                yield { type: 'run-settled', report: REPORT } as RunStreamEvent
              })(),
          }),
        ),
    )
  })

  it('stops depending on the clock once the run has settled', async () => {
    await inFrame(
      async ({ panel, run, clock }) => {
        await wrap(run.start({ title: 'A post' }))

        const settled = completedOf(panel.state())
        // The settled elapsed is the run's own reported time, so the clock may say anything.
        clock.value = 99_999
        expect(completedOf(panel.state()).elapsed).toBe('2.4s')
        expect(completedOf(panel.state()).nodes).toBe(settled.nodes)
        expect(panel.meta()).toEqual({ text: '#219 · 2.4s', tone: 'normal' })
      },
      () =>
        makeHarness(
          stubClient({
            startRun: async () =>
              streamOf([
                { type: 'run-accepted', runToken: 'tok' },
                { type: 'run-settled', report: REPORT },
              ]),
          }),
        ),
    )
  })
})

/**
 * `2A`'s dock status, which no `StudioApp` case ever asserted: `RunDock` has had `runStatus` since
 * the design sync and `StudioApp` derived it, but only `RunDock.test.tsx` — which is
 * fixture-driven — ever checked what it says.
 */
describe('the dock status', () => {
  /**
   * `2A:1191` draws the settled dock header as a state word plus meta, and no artboard anywhere
   * draws a settled dock as `Run <entry>`. Answering `undefined` while the run streamed made the
   * header change shape mid-run — `Run start1` up to the last event, a state word after it — which
   * is a third behaviour no artboard shows. Naming the running state is what holds one shape.
   */
  it('names the run from the first event to the last, so the header never changes shape', async () => {
    const streamGate = gate()
    await inFrame(
      async ({ panel, run }) => {
        expect(panel.dockStatus()).toBeUndefined()

        const pending = run.start({ title: 'A post' })
        await flush()
        // `Run panel — states` (design 2009-2011): a spinner, `Running`, and `#219` opposite.
        expect(panel.dockStatus()).toBe('running')

        streamGate.release()
        await wrap(pending)
        expect(panel.dockStatus()).toBe('completed')
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
})

/**
 * R9 — what the failed panel's mono `stack` block may draw.
 *
 * Measured against a real run of `examples/showcase/pokedex` rather than against the types:
 *
 *  * a handler that **returns** its failure — the repository's `errore` convention, and what every
 *    showcase node does — crosses as `{ _tag, message, authored: true }` and carries **no frames**.
 *    `server/runWire.ts` attaches them only to a `NodeExecutionError`, which the engine builds only
 *    for a **thrown** value. So the block draws nothing, which is the honest answer and not a
 *    missing feature: there is no well around an empty list.
 *  * a handler that **throws** crosses as `NodeExecutionError` with real trimmed frames
 *    (`at Object.run (nodes/lookup.ts:34)`) and a real `hiddenFrames` count, and the block draws.
 *
 * The third case is the one this file can catch and a browser cannot: the frames and the error the
 * panel prints above them must come off the **same** payload.
 */
describe('R9: the failed panel’s stack excerpt', () => {
  const RETURNED = {
    _tag: 'PokemonNotFoundError',
    message: 'No pokémon named zzzznotapokemon is in the pokédex',
    authored: true,
  }

  const THROWN = {
    _tag: 'NodeExecutionError',
    message: 'Node render failed',
    nodeId: 'render',
    runNumber: 220,
    frames: [{ fn: 'Object.run', file: 'nodes/render.ts', line: 34 }],
    hiddenFrames: 4,
  }

  const SKIPPED = {
    _tag: 'UpstreamFailedError',
    message: 'Node publish was skipped because upstream node render failed',
    nodeId: 'publish',
    upstreamNodeId: 'render',
    runNumber: 220,
  }

  function reportWith(error: unknown, nodes: readonly unknown[] = []): WireRunReportPayload {
    return {
      ...FAILED_REPORT,
      nodes: [
        REPORT.nodes[0],
        ...nodes,
        {
          nodeId: 'render',
          status: 'failed' as const,
          elapsedMs: 800,
          output: null,
          assets: {},
          error,
        },
      ],
    } as unknown as WireRunReportPayload
  }

  function failedHarness(report: WireRunReportPayload): Harness {
    return makeHarness(
      stubClient({
        startRun: async () =>
          streamOf([
            { type: 'run-accepted', runToken: 'tok' },
            { type: 'run-settled', report },
          ]),
      }),
    )
  }

  it('draws no stack for a failure a handler returned, because none is on the wire', async () => {
    await inFrame(
      async ({ panel, run }) => {
        await wrap(run.start({ title: 'A post' }))
        const state = failedOf(panel.state())
        expect(state.error.name).toBe('PokemonNotFoundError')
        expect(state.error.message).toContain('zzzznotapokemon')
        expect(state.stack).toBeUndefined()
      },
      () => failedHarness(reportWith(RETURNED)),
    )
  })

  it('draws the frames and the trimmed count for a failure a handler threw', async () => {
    await inFrame(
      async ({ panel, run }) => {
        await wrap(run.start({ title: 'A post' }))
        const state = failedOf(panel.state())
        expect(state.stack?.frames).toEqual([
          { fn: 'Object.run', file: 'nodes/render.ts', line: 34 },
        ])
        expect(state.stack?.hiddenFrames).toBe(4)
      },
      () => failedHarness(reportWith(THROWN)),
    )
  })

  it('takes the frames off the same node the error above them names', async () => {
    await inFrame(
      async ({ panel, run }) => {
        await wrap(run.start({ title: 'A post' }))
        const state = failedOf(panel.state())
        // The skipped node carries a real `UpstreamFailedError` and comes first in the node map.
        // It is a consequence of the failure, never the failure itself, so neither half reads it.
        expect(state.error.nodeId).toBe('render')
        expect(state.error.name).toBe('NodeExecutionError')
        expect(state.stack?.frames.map((frame) => frame.file)).toEqual(['nodes/render.ts'])
      },
      () =>
        failedHarness(
          reportWith(THROWN, [
            {
              nodeId: 'publish',
              status: 'skipped' as const,
              elapsedMs: 0,
              output: null,
              assets: {},
              error: SKIPPED,
            },
          ]),
        ),
    )
  })
})

/**
 * `3C` Modal C, from the model side. The dialog itself is asserted in
 * `modals/StackTraceModal/StackTraceModal.test.tsx`; what is asserted here is the projection, and
 * above all **the two rows that are not in it** — the artboard draws `node`, `input` and `runtime`
 * and only the first has anything behind it on the wire.
 */
describe('the stack trace dialog', () => {
  const WITH_FRAMES = {
    ...IMAGE_RENDER_ERROR,
    frames: [
      { fn: 'imageOut.raster', file: 'imageOut.ts', line: 184 },
      { fn: 'render.invoke', file: 'flow.ts', line: 41 },
    ],
    hiddenFrames: 6,
  }

  const REPORT_WITH_FRAMES = {
    ...FAILED_REPORT,
    nodes: [
      REPORT.nodes[0],
      {
        nodeId: 'render',
        status: 'failed' as const,
        elapsedMs: 800,
        output: null,
        assets: {},
        error: WITH_FRAMES,
      },
    ],
  } as unknown as WireRunReportPayload

  function failedHarness(report: WireRunReportPayload): Harness {
    return makeHarness(
      stubClient({
        startRun: async () =>
          streamOf([
            { type: 'run-accepted', runToken: 'tok' },
            { type: 'run-settled', report },
          ]),
      }),
    )
  }

  it('draws nothing until View trace is pressed, and nothing at all without a failure', async () => {
    await inFrame(
      async ({ panel, run }) => {
        expect(panel.trace()).toBeUndefined()
        // A run that has not failed cannot open it: `openTrace` reads `failedDetail` first.
        panel.openTrace()
        expect(panel.traceOpen()).toBe(false)

        await wrap(run.start({ title: 'A post' }))
        expect(panel.trace()).toBeUndefined()
        panel.openTrace()
        expect(panel.trace()).toBeDefined()
      },
      () => failedHarness(REPORT_WITH_FRAMES),
    )
  })

  it('carries the artboard header, the error and every frame the wire sent', async () => {
    await inFrame(
      async ({ panel, run }) => {
        await wrap(run.start({ title: 'A post' }))
        panel.openTrace()
        const view = panel.trace()

        expect(view?.context).toBe('render · run #219 · 0.8s')
        expect(view?.errorClass).toBe('ImageRenderError')
        expect(view?.errorMessage.map((segment) => segment.text).join('')).toBe(
          'Unsupported colour profile in the inlined asset.',
        )
        expect(view?.frames).toEqual([
          { fn: 'imageOut.raster', file: 'imageOut.ts', line: 184 },
          { fn: 'render.invoke', file: 'flow.ts', line: 41 },
        ])
      },
      () => failedHarness(REPORT_WITH_FRAMES),
    )
  })

  /**
   * The honesty rule, asserted as an absence: the design's `input` (`markdown · 1.4 kb`) and
   * `runtime` (`0.9.2 · node 20.11`) rows have no wire field, so they are missing rather than
   * plausible. The `node` row survives because both halves — the id the error names and that node's
   * `kind` — are in the document.
   */
  it('renders only the meta row the wire can fill', async () => {
    await inFrame(
      async ({ panel, run }) => {
        await wrap(run.start({ title: 'A post' }))
        panel.openTrace()

        expect(panel.trace()?.meta).toEqual([
          { label: 'node', value: 'render · transform', tone: 'lifted' },
        ])
      },
      () => failedHarness(REPORT_WITH_FRAMES),
    )
  })

  /**
   * The trimmed-frame count is real — `server/stackFrames.ts` counts it and `runWire.ts` sends it —
   * but the frames behind it never leave the server, so it arrives as the design's own static
   * read-out rather than as `3C`'s accent link.
   */
  it('states the trimmed frames as a read-out, and omits the line when none were trimmed', async () => {
    await inFrame(
      async ({ panel, run }) => {
        await wrap(run.start({ title: 'A post' }))
        panel.openTrace()
        expect(panel.trace()?.hiddenFrames).toBe('↳ 6 frames hidden')
      },
      () => failedHarness(REPORT_WITH_FRAMES),
    )

    await inFrame(
      async ({ panel, run }) => {
        await wrap(run.start({ title: 'A post' }))
        panel.openTrace()
        // A payload with no `frames` array produces no stack at all, so no list and no read-out.
        expect(panel.trace()?.hiddenFrames).toBeUndefined()
        expect(panel.trace()?.frames).toEqual([])
      },
      () => failedHarness(FAILED_REPORT),
    )
  })

  it('copies the trace, holds Copied, and refuses a second press while it stands', async () => {
    const writeText = vi.fn(async (_text: string) => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    try {
      await inFrame(
        async ({ panel, run }) => {
          await wrap(run.start({ title: 'A post' }))
          panel.openTrace()
          expect(panel.trace()?.copied).toBe(false)

          panel.copyTrace()
          await flush()
          expect(panel.trace()?.copied).toBe(true)
          expect(writeText).toHaveBeenCalledTimes(1)
          const written = String(writeText.mock.calls[0]?.[0])
          expect(written).toContain(
            'ImageRenderError: Unsupported colour profile in the inlined asset.',
          )
          expect(written).toContain('at imageOut.raster (imageOut.ts:184)')

          // `3A` §2.5: a press is refused while `Copied` still stands.
          panel.copyTrace()
          await flush()
          expect(writeText).toHaveBeenCalledTimes(1)
        },
        () => failedHarness(REPORT_WITH_FRAMES),
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('closes on dismiss and forgets the copy confirmation with it', async () => {
    const writeText = vi.fn(async (_text: string) => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    try {
      await inFrame(
        async ({ panel, run }) => {
          await wrap(run.start({ title: 'A post' }))
          panel.openTrace()
          panel.copyTrace()
          await flush()
          expect(panel.trace()?.copied).toBe(true)

          panel.closeTrace()
          expect(panel.trace()).toBeUndefined()
          panel.openTrace()
          expect(panel.trace()?.copied).toBe(false)
        },
        () => failedHarness(REPORT_WITH_FRAMES),
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('retries the failed node through the run model and closes itself', async () => {
    await inFrame(
      async ({ panel, run }) => {
        await wrap(run.start({ title: 'A post' }))
        panel.openTrace()

        panel.retryTraceNode()
        expect(panel.traceOpen()).toBe(false)
        expect(run.retry()).toEqual({
          nodeId: 'render',
          errorName: 'ImageRenderError',
          message: 'Unsupported colour profile in the inlined asset.',
        })
      },
      () => failedHarness(REPORT_WITH_FRAMES),
    )
  })
})

describe('saved run panel', () => {
  it('shows immutable saved input and graph rather than the editable draft and disables implicit rerun', async () => {
    const oldDocument = { ...DOCUMENT, literals: { start1: { title: 'old graph' } } }
    await inFrame(
      async ({ run, panel, inputs, descriptor }) => {
        inputs.setInputField('title', 'new editable input')
        run.selectRun('saved-uuid')
        const stop = panel.state.subscribe(() => {})
        await flush()
        const state = panel.state()
        expect(state?.kind).toBe('completed')
        if (state?.kind !== 'completed') return
        expect(state.inputs).toBeUndefined()
        expect(state.entryNodeId).toBeUndefined()
        expect(state.onRerun).toBeUndefined()
        expect(state.snapshot).toEqual({
          runId: 'saved-uuid',
          startId: 'start1',
          revision: 'old-revision',
          input: { title: 'original input' },
          document: oldDocument,
        })
        expect(inputs.inputDraft().title).toBe('new editable input')
        descriptor.set({ ...DESCRIPTOR, nodes: [], startIds: [] })
        expect(panel.state()?.kind).toBe('completed')
        stop()
      },
      () =>
        makeHarness(
          stubClient({
            getRun: async () => ({
              schemaVersion: 1,
              runId: 'saved-uuid',
              flowId: 'publication',
              startId: 'start1',
              createdAt: 1,
              updatedAt: 2,
              runNumber: 219,
              status: 'ok',
              input: { title: 'original input' },
              document: oldDocument,
              revision: 'old-revision',
              report: REPORT,
              events: [],
              failure: null,
            }),
          }),
        ),
    )
  })

  it('keeps a successful execution successful while visibly reporting a storage failure', async () => {
    await inFrame(
      async ({ run, panel }) => {
        await wrap(run.start({ title: 'paid input' }))
        const state = panel.state()
        expect(state?.kind).toBe('completed')
        if (state?.kind === 'completed') expect(state.storageWarning).toBe('Disk is full')
      },
      () =>
        makeHarness(
          stubClient({
            startRun: async () =>
              streamOf([
                {
                  type: 'run-settled',
                  report: { ...REPORT, storageError: { _tag: null, message: 'Disk is full' } },
                },
              ]),
          }),
        ),
    )
  })
})
