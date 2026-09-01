import type { FlowDocument } from '@jobik/core'
import { atom, computed, context, withAsyncData, wrap } from '@reatom/core'
import { describe, expect, it } from 'vitest'
import type { JobikClient, LoadedFlowPayload, SafeFlowDescriptorPayload } from '#client/index.js'
import { reatomInputs } from './inputs.js'
import type { InputsModel, StudioDeps } from './types.js'

/**
 * The model's own tests for the selected start and the typed run inputs.
 *
 * Every case here was a `useStudioSession.test.ts` case first, and each keeps that case's name so
 * the mapping stays auditable. They run against the model directly inside `context.start()` rather
 * than through `renderHook`, which is faster and more precise — and is the whole reason the model is
 * a factory rather than a module of singletons.
 *
 * **Every promise this file awaits is a `wrap`ped one.** `context.start(async …)` holds its frame
 * only across wrapped boundaries; resuming from a bare `await` puts the reads that follow in the
 * DEFAULT context, where these atoms have never been written, and every assertion then reads
 * `undefined`. `World.settle` returns a wrapped promise for exactly that reason, and so does
 * `withInputs` around each test body. See `wrap`'s own rules (RTM-A04).
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

/** The same flow after a *document* edit — a card dragged on disk, nothing else. */
const MOVED_DOCUMENT = {
  ...DOCUMENT,
  layout: { start1: { x: 800, y: 0 } },
} as unknown as FlowDocument

/** The same start id, authored since with a second field: the seeded draft no longer fits. */
const RESHAPED_DESCRIPTOR = {
  ...DESCRIPTOR,
  nodes: [
    {
      ...DESCRIPTOR.nodes[0],
      input: {
        nodeId: 'start1',
        fields: [
          ...DESCRIPTOR.nodes[0].input.fields,
          {
            field: 'markdown',
            required: true,
            annotation: 'string',
            control: { kind: 'string' as const },
          },
        ],
      },
    },
  ],
}

/** The start the panel was pointed at is gone; the flow declares another one. */
const RESTARTED_DESCRIPTOR = {
  ...DESCRIPTOR,
  startIds: ['start2'],
  nodes: [
    {
      ...DESCRIPTOR.nodes[0],
      id: 'start2',
      input: { ...DESCRIPTOR.nodes[0].input, nodeId: 'start2' },
      output: { ...DESCRIPTOR.nodes[0].output, nodeId: 'start2' },
    },
  ],
}

const TWO_START_DOCUMENT = {
  format: 'jobik.flow',
  version: 1,
  connections: [],
  literals: {},
  layout: { byName: { x: 0, y: 0 }, byNumber: { x: 0, y: 120 } },
} as unknown as FlowDocument

/**
 * The repository's only two-start fixture. `byNumber`'s default is what makes a re-seed observable —
 * without it both starts would seed the same empty draft.
 */
const TWO_START_DESCRIPTOR = {
  id: 'pokedex',
  name: 'pokedex',
  documentFile: 'flow.jobik.json',
  sourceFile: 'flow.ts',
  startIds: ['byName', 'byNumber'],
  nodes: [
    {
      id: 'byName',
      kind: 'start' as const,
      title: 'start',
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
      output: {
        nodeId: 'byName',
        fields: [{ field: 'name', required: true, annotation: 'string' }],
      },
    },
    {
      id: 'byNumber',
      kind: 'start' as const,
      title: 'start',
      input: {
        nodeId: 'byNumber',
        fields: [
          {
            field: 'number',
            required: true,
            annotation: 'number',
            control: { kind: 'number' as const, integer: true },
            default: 25,
          },
        ],
      },
      output: {
        nodeId: 'byNumber',
        fields: [{ field: 'number', required: true, annotation: 'number' }],
      },
    },
  ],
}

const DEPS: StudioDeps = {
  // The inputs model reaches nothing outside itself; the client is here because the contract's
  // signature carries one, and nothing in this file ever calls it.
  client: {} as JobikClient,
  now: () => 1000,
}

interface World {
  readonly inputs: InputsModel
  /** Answers the next load. Standing in for `flows.loaded`, which is another module's. */
  readonly land: (payload: LoadedFlowPayload | Error) => void
  /**
   * Waits until the payload the last {@link World.land} named has actually landed on the async
   * unit. Everything downstream of it is pulled on read, so once it has, every assertion that
   * follows is looking at a settled graph.
   */
  readonly settle: () => Promise<void>
  readonly locked: ReturnType<typeof atom<boolean>>
  readonly disconnect: () => void
}

/**
 * One Studio's worth of inputs, wired to a stand-in for `FlowsModel.loaded`.
 *
 * The stand-in is a real `computed(async) + withAsyncData`, because that is what the contract types
 * the input as and the whole F10 predicate keys on when a load actually *lands*. `land()` bumps the
 * nonce the computed reads, which is what a mount load and a `reloadFromDisk` both do to it.
 */
function createWorld(): World {
  let answer: LoadedFlowPayload | Error | undefined
  const nonce = atom(0, 'test.nonce')

  const loaded = computed(async () => {
    nonce()
    const pending = answer
    if (pending === undefined) return new Error('no load has been asked for')
    return await wrap(Promise.resolve(pending))
  }, 'test.loaded').extend(withAsyncData())

  const descriptor = computed<SafeFlowDescriptorPayload | undefined>(() => {
    const payload = loaded.data()
    return payload === undefined || payload instanceof Error ? undefined : payload.descriptor
  }, 'test.descriptor')

  const locked = atom(false, 'test.locked')
  const inputs = reatomInputs(DEPS, { descriptor, loaded, locked }, 'studio.inputs')

  // What `@reatom/react` does for the real Studio: the surfaces read these atoms, which connects
  // the graph behind them all the way down to the async load.
  const unsubscribes = [
    inputs.startId.subscribe(() => {}),
    inputs.selectedNodeId.subscribe(() => {}),
    inputs.inputDraft.subscribe(() => {}),
    inputs.issues.subscribe(() => {}),
    inputs.startNode.subscribe(() => {}),
    inputs.schema.subscribe(() => {}),
    inputs.presentation.subscribe(() => {}),
  ]

  return {
    inputs,
    locked,
    land: (payload) => {
      answer = payload
      nonce.set(nonce() + 1)
    },
    // The returned promise is `wrap`ped, and that is the load-bearing part: `await settle()` in a
    // test body is an ordinary `await`, and without the wrap it would resume in the DEFAULT context
    // — where these atoms have never been written — so every assertion after it would read
    // `undefined`. The hops themselves touch no atom and need no frame.
    settle: () =>
      wrap(
        (async () => {
          for (let hop = 0; hop < 4; hop += 1) {
            await new Promise<void>((resolve) => setTimeout(resolve, 0))
          }
        })(),
      ),
    disconnect: () => {
      for (const unsubscribe of unsubscribes) unsubscribe()
    },
  }
}

async function withInputs(body: (world: World) => Promise<void>): Promise<void> {
  await context.start(async () => {
    const world = createWorld()
    try {
      await wrap(body(world))
    } finally {
      world.disconnect()
    }
  })
}

describe('loading', () => {
  it('seeds the run input draft from the start descriptor', async () => {
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: 'rev-1' })
      await settle()

      expect(inputs.inputDraft().title).toBe('')
      expect(inputs.startId()).toBe('start1')
    })
  })
})

describe('validate and save', () => {
  it('keeps the typed run inputs across a reload that leaves the start descriptor alone', async () => {
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: 'rev-1' })
      await settle()
      inputs.setInputField('title', 'Half a typed headline')

      land({ descriptor: DESCRIPTOR, document: MOVED_DOCUMENT, revision: 'rev-9' })
      await settle()

      expect(inputs.inputDraft().title).toBe('Half a typed headline')
      expect(inputs.startId()).toBe('start1')
      expect(inputs.selectedNodeId()).toBe('start1')
    })
  })

  it('re-seeds the run inputs when the reload changes the start input schema', async () => {
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: 'rev-1' })
      await settle()
      inputs.setInputField('title', 'Half a typed headline')

      land({ descriptor: RESHAPED_DESCRIPTOR, document: DOCUMENT, revision: 'rev-9' })
      await settle()

      expect(inputs.inputDraft()).toEqual({ title: '', markdown: '' })
      expect(inputs.startId()).toBe('start1')
    })
  })

  it('re-seeds the run inputs when the reload no longer declares the selected start', async () => {
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: 'rev-1' })
      await settle()
      inputs.setInputField('title', 'Half a typed headline')

      land({ descriptor: RESTARTED_DESCRIPTOR, document: DOCUMENT, revision: 'rev-9' })
      await settle()

      expect(inputs.startId()).toBe('start2')
      expect(inputs.selectedNodeId()).toBe('start2')
      expect(inputs.inputDraft()).toEqual({ title: '' })
    })
  })
})

describe('choosing a start', () => {
  it('seeds the first declared start and its input draft', async () => {
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor: TWO_START_DESCRIPTOR, document: TWO_START_DOCUMENT, revision: 'rev-p1' })
      await settle()

      expect(inputs.startId()).toBe('byName')
      expect(inputs.inputDraft()).toEqual({ name: '' })
    })
  })

  it('re-seeds the input draft from the start it is moved to', async () => {
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor: TWO_START_DESCRIPTOR, document: TWO_START_DOCUMENT, revision: 'rev-p1' })
      await settle()
      inputs.setInputField('name', 'pikachu')

      inputs.selectStart('byNumber')

      expect(inputs.startId()).toBe('byNumber')
      expect(inputs.selectedNodeId()).toBe('byNumber')
      expect(inputs.inputDraft()).toEqual({ number: '25' })
    })
  })

  /**
   * The hook's version of this case asserted the wire call `startRun({ startId: 'byNumber', input:
   * { number: 25 } })`. Starting a run is `model/run.ts`'s, and `values()` is the whole of what this
   * model contributes to it, so the assertion moves onto the two things that decide that call: the
   * start the panel is on, and the values it would carry.
   */
  it('runs the start it is pointed at, not the first one', async () => {
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor: TWO_START_DESCRIPTOR, document: TWO_START_DOCUMENT, revision: 'rev-p1' })
      await settle()

      inputs.selectStart('byNumber')

      expect(inputs.startId()).toBe('byNumber')
      expect(inputs.values()).toEqual({ number: 25 })
    })
  })

  it('ignores a start the descriptor does not declare', async () => {
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor: TWO_START_DESCRIPTOR, document: TWO_START_DOCUMENT, revision: 'rev-p1' })
      await settle()

      inputs.selectStart('byColour')

      expect(inputs.startId()).toBe('byName')
    })
  })

  it('ignores a start change while a run is in flight', async () => {
    await withInputs(async ({ inputs, land, locked, settle }) => {
      land({ descriptor: TWO_START_DESCRIPTOR, document: TWO_START_DOCUMENT, revision: 'rev-p1' })
      await settle()

      locked.set(true)
      inputs.selectStart('byNumber')

      expect(inputs.startId()).toBe('byName')
    })
  })
})

/**
 * F02 and R35, which lived in `StudioApp` rather than in the hook and so had no case of their own
 * in `useStudioSession.test.ts`. They are the rest of this model's surface, and the reason `issues`
 * is on the model at all: four of the five run affordances are not the run panel's.
 */
describe('the draft as run values', () => {
  it('collects typed values rather than the strings the controls hold', async () => {
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor: TWO_START_DESCRIPTOR, document: TWO_START_DOCUMENT, revision: 'rev-p1' })
      await settle()
      inputs.selectStart('byNumber')
      inputs.setInputField('number', '1024')

      expect(inputs.values()).toEqual({ number: 1024 })
      expect(inputs.issues()).toBeUndefined()
    })
  })

  it('files what the schema rejected on issues instead of failing silently', async () => {
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor: TWO_START_DESCRIPTOR, document: TWO_START_DOCUMENT, revision: 'rev-p1' })
      await settle()
      inputs.selectStart('byNumber')
      inputs.setInputField('number', '')

      expect(inputs.values()).toBeUndefined()
      expect(inputs.issues()).toEqual([expect.objectContaining({ path: 'number' })])
    })
  })

  it('retires the last finding on the next keystroke', async () => {
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor: TWO_START_DESCRIPTOR, document: TWO_START_DOCUMENT, revision: 'rev-p1' })
      await settle()
      inputs.selectStart('byNumber')
      inputs.setInputField('number', '')
      expect(inputs.values()).toBeUndefined()

      inputs.setInputField('number', '7')

      expect(inputs.issues()).toBeUndefined()
      expect(inputs.values()).toEqual({ number: 7 })
    })
  })

  it('takes the run panel’s own finding through reportInvalid', async () => {
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: 'rev-1' })
      await settle()

      inputs.reportInvalid(new Error('title: Invalid input'))

      expect(inputs.issues()).toEqual([{ path: '', message: 'title: Invalid input' }])
    })
  })

  it('ignores a keystroke while a run is in flight', async () => {
    await withInputs(async ({ inputs, land, locked, settle }) => {
      land({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: 'rev-1' })
      await settle()

      locked.set(true)
      inputs.setInputField('title', 'typed under a run')

      expect(inputs.inputDraft().title).toBe('')
    })
  })

  it('derives the schema and the presentation from the start it is pointed at', async () => {
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: 'rev-1' })
      await settle()

      expect(inputs.schema()?.safeParse({ title: 'ok' }).success).toBe(true)
      expect(inputs.presentation()).toEqual({ title: 'line' })

      inputs.setInputField('title', `${'x'.repeat(200)}`)
      expect(inputs.presentation()).toEqual({ title: 'area' })
    })
  })
})

describe('reset', () => {
  it('clears the start, the marked node, the draft and the findings', async () => {
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: 'rev-1' })
      await settle()
      inputs.setInputField('title', 'Half a typed headline')
      inputs.reportInvalid(new Error('title: Invalid input'))

      inputs.reset()

      expect(inputs.startId()).toBeUndefined()
      expect(inputs.selectedNodeId()).toBeUndefined()
      expect(inputs.inputDraft()).toEqual({})
      expect(inputs.issues()).toBeUndefined()
    })
  })

  /**
   * F10's third case, and the reason no origin flag is needed: `switchTo` calls every sub-model's
   * `reset` before the new flow's load lands, so the predicate sees `startId === undefined` and
   * re-seeds exactly as a mount load does.
   */
  it('re-seeds from the flow that lands after it, rather than keeping the one it left', async () => {
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: 'rev-1' })
      await settle()
      inputs.setInputField('title', 'Half a typed headline')

      inputs.reset()
      land({ descriptor: TWO_START_DESCRIPTOR, document: TWO_START_DOCUMENT, revision: 'rev-p1' })
      await settle()

      expect(inputs.startId()).toBe('byName')
      expect(inputs.inputDraft()).toEqual({ name: '' })
    })
  })
})
