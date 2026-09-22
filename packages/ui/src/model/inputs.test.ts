import type { FlowDocument } from '@jobik/core'
import { atom, computed, context, withAsyncData, wrap } from '@reatom/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
function createWorld(deps: StudioDeps = DEPS): World {
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
  const inputs = reatomInputs(deps, { descriptor, loaded, locked }, 'studio.inputs')

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
    inputs.uploads.subscribe(() => {}),
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

async function withInputs(
  body: (world: World) => Promise<void>,
  deps: StudioDeps = DEPS,
): Promise<void> {
  await context.start(async () => {
    const world = createWorld(deps)
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

afterEach(() => vi.unstubAllGlobals())

const IMAGE_DESCRIPTOR: SafeFlowDescriptorPayload = {
  ...DESCRIPTOR,
  startIds: ['start1', 'other'],
  nodes: ['start1', 'other'].map((id) => ({
    ...DESCRIPTOR.nodes[0],
    id,
    inputUploads: { photo: { accept: 'image/png,image/jpeg', maxBytes: 100 } },
    input: {
      nodeId: id,
      fields: [
        {
          field: 'photo',
          required: true,
          annotation: 'object',
          control: { kind: 'json', schema: { type: 'object' } },
        },
      ],
    },
  })),
}

function uploadWorld() {
  const responses: Array<(result: { value: unknown } | Error) => void> = []
  const uploadInput = vi.fn<JobikClient['uploadInput']>(
    async () => new Promise((resolve) => responses.push(resolve)),
  )
  const createObjectURL = vi.fn((file: Blob) => `blob:preview-${file.size}-${responses.length}`)
  const revokeObjectURL = vi.fn<(url: string) => void>()
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = createObjectURL
      static revokeObjectURL = revokeObjectURL
    },
  )
  return {
    responses,
    uploadInput,
    createObjectURL,
    revokeObjectURL,
    deps: { ...DEPS, client: { uploadInput } as unknown as JobikClient },
  }
}

describe('declared image uploads', () => {
  it.each([
    ['image/*', 'photo.png', 'image/png'],
    ['.PNG', 'PHOTO.PNG', ''],
    ['IMAGE/PNG', 'photo.png', 'image/png'],
  ])('accepts %s consistently with the native picker and server', async (accept, name, type) => {
    const f = uploadWorld()
    const descriptor = {
      ...IMAGE_DESCRIPTOR,
      nodes: IMAGE_DESCRIPTOR.nodes.map((node) => ({
        ...node,
        inputUploads: { photo: { accept, maxBytes: 100 } },
      })),
    }
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor, document: DOCUMENT, revision: '1' })
      await settle()
      inputs.uploads().photo?.onSelect(new File(['png'], name, { type }))
      await settle()
      expect(f.uploadInput).toHaveBeenCalledTimes(1)
      f.responses[0]?.({ value: { key: 'photo' } })
      await settle()
      expect(inputs.inputDraft().photo).toBe('{"key":"photo"}')
    }, f.deps)
  })

  it('previews the selected file, blocks values while pending, then replaces JSON with the returned value', async () => {
    const f = uploadWorld()
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor: IMAGE_DESCRIPTOR, document: DOCUMENT, revision: '1' })
      await settle()
      inputs.setInputField('photo', '{"previous":true}')
      inputs.uploads().photo?.onSelect(new File(['png'], 'portrait.png', { type: 'image/png' }))
      expect(inputs.uploading()).toBe(true)
      expect(inputs.values()).toBeUndefined()
      expect(inputs.uploads().photo?.previewUrl).toMatch(/^blob:/)
      expect(inputs.inputDraft().photo).toBe('{"previous":true}')
      await settle()
      expect(f.uploadInput).toHaveBeenCalledWith(
        expect.objectContaining({
          flowId: 'publication',
          nodeId: 'start1',
          field: 'photo',
          file: { name: 'portrait.png', contentType: 'image/png', dataBase64: 'cG5n' },
        }),
      )
      f.responses[0]?.({ value: { key: 'stored-photo' } })
      await settle()
      expect(inputs.inputDraft().photo).toBe('{"key":"stored-photo"}')
      expect(inputs.uploading()).toBe(false)
      expect(inputs.values()).toEqual({ photo: { key: 'stored-photo' } })
    }, f.deps)
    expect(f.revokeObjectURL).toHaveBeenCalledTimes(1)
  })

  it('keeps the prior draft on transport failure and reports a field-local error', async () => {
    const f = uploadWorld()
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor: IMAGE_DESCRIPTOR, document: DOCUMENT, revision: '1' })
      await settle()
      inputs.setInputField('photo', '{"previous":true}')
      inputs.uploads().photo?.onSelect(new File(['png'], 'photo.png', { type: 'image/png' }))
      await settle()
      f.responses[0]?.(new Error('Upload unavailable'))
      await settle()
      expect(inputs.inputDraft().photo).toBe('{"previous":true}')
      expect(inputs.uploads().photo?.message).toContain('Upload unavailable')
      expect(inputs.uploading()).toBe(false)
    }, f.deps)
  })

  it('rejects unsupported and oversized files locally without overwriting an existing draft', async () => {
    const f = uploadWorld()
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor: IMAGE_DESCRIPTOR, document: DOCUMENT, revision: '1' })
      await settle()
      inputs.setInputField('photo', '{"previous":true}')
      for (const file of [
        new File(['bad'], 'bad.svg', { type: 'image/svg+xml' }),
        new File(['x'.repeat(101)], 'large.png', { type: 'image/png' }),
      ]) {
        inputs.uploads().photo?.onSelect(file)
        await settle()
        expect(inputs.uploads().photo?.message).toBeTruthy()
        expect(inputs.inputDraft().photo).toBe('{"previous":true}')
      }
      expect(f.uploadInput).not.toHaveBeenCalled()
    }, f.deps)
  })

  it('lets the latest file win and revokes replaced local previews', async () => {
    const f = uploadWorld()
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor: IMAGE_DESCRIPTOR, document: DOCUMENT, revision: '1' })
      await settle()
      inputs.uploads().photo?.onSelect(new File(['first'], 'first.png', { type: 'image/png' }))
      await settle()
      inputs.uploads().photo?.onSelect(new File(['second'], 'second.png', { type: 'image/png' }))
      await settle()
      expect(f.uploadInput.mock.calls[0]?.[0].signal?.aborted).toBe(true)
      f.responses[1]?.({ value: { key: 'second' } })
      f.responses[0]?.({ value: { key: 'first' } })
      await settle()
      expect(inputs.inputDraft().photo).toBe('{"key":"second"}')
      expect(f.revokeObjectURL).toHaveBeenCalledTimes(1)
    }, f.deps)
    expect(f.revokeObjectURL).toHaveBeenCalledTimes(2)
  })

  it.each(['field', 'start', 'reset', 'flow'] as const)(
    'discards an upload after %s changes, even if the original start returns',
    async (change) => {
      const f = uploadWorld()
      await withInputs(async ({ inputs, land, settle }) => {
        land({ descriptor: IMAGE_DESCRIPTOR, document: DOCUMENT, revision: '1' })
        await settle()
        inputs.uploads().photo?.onSelect(new File(['png'], 'photo.png', { type: 'image/png' }))
        await settle()
        if (change === 'field') inputs.setInputField('photo', '{"manual":true}')
        if (change === 'start') {
          inputs.selectStart('other')
          inputs.selectStart('start1')
        }
        if (change === 'reset') {
          inputs.reset()
          land({ descriptor: { ...IMAGE_DESCRIPTOR }, document: DOCUMENT, revision: '2' })
        }
        if (change === 'flow')
          land({
            descriptor: { ...IMAGE_DESCRIPTOR, id: 'another-flow' },
            document: DOCUMENT,
            revision: '2',
          })
        await settle()
        f.responses[0]?.({ value: { key: 'stale' } })
        await settle()
        expect(inputs.inputDraft().photo).toBe(change === 'field' ? '{"manual":true}' : '')
        expect(inputs.uploading()).toBe(false)
        expect(f.revokeObjectURL).toHaveBeenCalledTimes(1)
      }, f.deps)
    },
  )
})

describe('persistent input drafts', () => {
  const persistedDeps = () => ({
    ...DEPS,
    inputDraftStorage: { storage: localStorage, namespace: 'test-api' },
  })

  afterEach(() => localStorage.clear())

  it('restores raw strings and JSON in a fresh model without collecting or running', async () => {
    const deps = persistedDeps()
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor: IMAGE_DESCRIPTOR, document: DOCUMENT, revision: '1' })
      await settle()
      inputs.setInputField('photo', '{"unfinished":')
    }, deps)
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor: IMAGE_DESCRIPTOR, document: DOCUMENT, revision: '1' })
      await settle()
      expect(inputs.inputDraft().photo).toBe('{"unfinished":')
      expect(inputs.issues()).toBeUndefined()
      expect(inputs.values()).toBeUndefined()
    }, deps)
  })

  it('keeps starts, flows and API namespaces separate, including across internal resets', async () => {
    const deps = persistedDeps()
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor: TWO_START_DESCRIPTOR, document: DOCUMENT, revision: '1' })
      await settle()
      inputs.setInputField('name', 'saved name')
      inputs.selectStart('byNumber')
      inputs.setInputField('number', '')
      inputs.selectStart('byName')
      expect(inputs.inputDraft()).toEqual({ name: 'saved name' })
      inputs.selectStart('byNumber')
      expect(inputs.inputDraft()).toEqual({ number: '' })
      inputs.reset()
      land({
        descriptor: { ...TWO_START_DESCRIPTOR, id: 'other-flow' },
        document: DOCUMENT,
        revision: '2',
      })
      await settle()
      expect(inputs.inputDraft()).toEqual({ name: '' })
      inputs.setInputField('name', 'other name')
      inputs.reset()
      land({ descriptor: TWO_START_DESCRIPTOR, document: DOCUMENT, revision: '3' })
      await settle()
      expect(inputs.inputDraft()).toEqual({ name: 'saved name' })
    }, deps)
    await withInputs(
      async ({ inputs, land, settle }) => {
        land({ descriptor: TWO_START_DESCRIPTOR, document: DOCUMENT, revision: '1' })
        await settle()
        expect(inputs.inputDraft()).toEqual({ name: '' })
      },
      { ...deps, inputDraftStorage: { storage: localStorage, namespace: 'another-api' } },
    )
  })

  it('restores false and empty fields but rejects a changed input descriptor', async () => {
    const descriptor: SafeFlowDescriptorPayload = {
      ...DESCRIPTOR,
      nodes: [
        {
          ...DESCRIPTOR.nodes[0],
          input: {
            nodeId: 'start1',
            fields: [
              ...DESCRIPTOR.nodes[0].input.fields,
              {
                field: 'enabled',
                required: true,
                annotation: 'boolean',
                default: true,
                control: { kind: 'boolean' },
              },
            ],
          },
        },
      ],
    }
    const deps = persistedDeps()
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor, document: DOCUMENT, revision: '1' })
      await settle()
      inputs.setInputField('title', '')
      inputs.setInputField('enabled', false)
    }, deps)
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor, document: DOCUMENT, revision: '2' })
      await settle()
      expect(inputs.inputDraft()).toEqual({ title: '', enabled: false })
      land({ descriptor: RESHAPED_DESCRIPTOR, document: DOCUMENT, revision: '3' })
      await settle()
      expect(inputs.inputDraft()).toEqual({ title: '', markdown: '' })
    }, deps)
  })

  it.each(['invalid JSON', 'null', '{"data":null,"version":1,"to":9999999999999}'])(
    'ignores corrupt storage: %s',
    async (corrupt) => {
      const deps = persistedDeps()
      await withInputs(async ({ inputs, land, settle }) => {
        land({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: '1' })
        await settle()
        inputs.setInputField('title', 'saved')
      }, deps)
      expect(localStorage.length).toBeGreaterThan(0)
      for (let index = 0; index < localStorage.length; index++)
        localStorage.setItem(localStorage.key(index) ?? '', corrupt)
      await withInputs(async ({ inputs, land, settle }) => {
        land({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: '1' })
        await settle()
        expect(inputs.inputDraft()).toEqual({ title: '' })
        inputs.setInputField('title', 'usable')
        expect(inputs.values()).toEqual({ title: 'usable' })
      }, deps)
    },
  )

  it('restores only declared fields of the correct draft type from a valid storage envelope', async () => {
    const deps = persistedDeps()
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: '1' })
      await settle()
      inputs.setInputField('title', 'saved')
    }, deps)
    const key = localStorage.key(0) ?? ''
    const record = JSON.parse(localStorage.getItem(key) ?? 'null')
    localStorage.setItem(key, JSON.stringify({ ...record, data: { title: 42, extra: 'ignored' } }))
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: '1' })
      await settle()
      expect(inputs.inputDraft()).toEqual({ title: '' })
    }, deps)
  })

  it('keeps editing and validation usable when storage access or writes fail', async () => {
    const storage = {
      getItem: () => {
        throw new Error('access denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
      removeItem: () => {},
    } as unknown as Storage
    await withInputs(
      async ({ inputs, land, settle }) => {
        land({ descriptor: DESCRIPTOR, document: DOCUMENT, revision: '1' })
        await settle()
        inputs.setInputField('title', 'still usable')
        expect(inputs.values()).toEqual({ title: 'still usable' })
      },
      { ...DEPS, inputDraftStorage: { storage, namespace: 'failed-storage' } },
    )
  })

  it('persists successful upload references without transient previews, and discards late uploads', async () => {
    const f = uploadWorld()
    const deps = { ...f.deps, inputDraftStorage: persistedDeps().inputDraftStorage }
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor: IMAGE_DESCRIPTOR, document: DOCUMENT, revision: '1' })
      await settle()
      inputs.uploads().photo?.onSelect(new File(['png'], 'portrait.png', { type: 'image/png' }))
      await settle()
      f.responses[0]?.({ value: { key: 'stored-photo' } })
      await settle()
      inputs.uploads().photo?.onSelect(new File(['png'], 'late.png', { type: 'image/png' }))
      await settle()
      inputs.selectStart('other')
      inputs.selectStart('start1')
      f.responses[1]?.({ value: { key: 'stale-photo' } })
      await settle()
      expect(inputs.inputDraft().photo).toBe('{"key":"stored-photo"}')
    }, deps)
    await withInputs(async ({ inputs, land, settle }) => {
      land({ descriptor: IMAGE_DESCRIPTOR, document: DOCUMENT, revision: '1' })
      await settle()
      expect(inputs.values()).toEqual({ photo: { key: 'stored-photo' } })
      expect(inputs.uploads().photo?.previewUrl).toBeUndefined()
      expect(inputs.uploading()).toBe(false)
    }, deps)
    const saved = Array.from({ length: localStorage.length }, (_, i) =>
      localStorage.getItem(localStorage.key(i) ?? ''),
    ).join('')
    expect(saved).not.toContain('blob:')
    expect(saved).not.toContain('cG5n')
    expect(saved).not.toContain('stale-photo')
  })
})

it('restores old uploaded references with new preview capability without migrating the draft', async () => {
  const f = uploadWorld()
  const deps = {
    ...f.deps,
    inputDraftStorage: { storage: localStorage, namespace: 'preview-restoration' },
  }
  await withInputs(async ({ inputs, land, settle }) => {
    land({ descriptor: IMAGE_DESCRIPTOR, document: DOCUMENT, revision: '1' })
    await settle()
    inputs.setInputField('photo', '{"key":"old-photo"}')
  }, deps)
  const keys = Object.keys(localStorage)
  const descriptor = {
    ...IMAGE_DESCRIPTOR,
    nodes: IMAGE_DESCRIPTOR.nodes.map((node) => ({
      ...node,
      inputUploads: { photo: { accept: 'image/png', maxBytes: 100, preview: true } },
    })),
  }
  await withInputs(async ({ inputs, land, settle }) => {
    land({ descriptor, document: DOCUMENT, revision: '2' })
    await settle()
    const src = inputs.uploads().photo?.previewUrl
    expect(src).toContain('/inputs/start1/photo/preview?value=')
    expect(decodeURIComponent(src ?? '')).toContain('{"key":"old-photo"}')
    expect(inputs.inputDraft().photo).toBe('{"key":"old-photo"}')
    expect(Object.keys(localStorage)).toEqual(keys)
    expect(f.uploadInput).not.toHaveBeenCalled()
    inputs.setInputField('photo', '{"key":"edited"}')
    expect(decodeURIComponent(inputs.uploads().photo?.previewUrl ?? '')).toContain('edited')
    inputs.setInputField('photo', '{"unfinished":')
    expect(inputs.uploads().photo?.previewUrl).toBeUndefined()
    expect(inputs.inputDraft().photo).toBe('{"unfinished":')
    inputs.setInputField('photo', '')
    expect(inputs.uploads().photo?.previewUrl).toBeUndefined()
  }, deps)
})

it('uses stored previews after successful uploads and ignores a late response after manual edits', async () => {
  const f = uploadWorld()
  const descriptor = {
    ...IMAGE_DESCRIPTOR,
    nodes: IMAGE_DESCRIPTOR.nodes.map((node) => ({
      ...node,
      inputUploads: { photo: { accept: 'image/png', maxBytes: 100, preview: true } },
    })),
  }
  await withInputs(async ({ inputs, land, settle }) => {
    land({ descriptor, document: DOCUMENT, revision: '1' })
    await settle()
    inputs.uploads().photo?.onSelect(new File(['png'], 'photo.png', { type: 'image/png' }))
    await settle()
    expect(inputs.uploads().photo?.previewUrl).toMatch(/^blob:/)
    f.responses[0]?.({ value: { key: 'stored' } })
    await settle()
    expect(decodeURIComponent(inputs.uploads().photo?.previewUrl ?? '')).toContain('stored')
    expect(f.revokeObjectURL).toHaveBeenCalledTimes(1)
    inputs.uploads().photo?.onSelect(new File(['png'], 'late.png', { type: 'image/png' }))
    await settle()
    inputs.setInputField('photo', '{"key":"manual"}')
    f.responses[1]?.({ value: { key: 'late' } })
    await settle()
    expect(inputs.inputDraft().photo).toBe('{"key":"manual"}')
    expect(decodeURIComponent(inputs.uploads().photo?.previewUrl ?? '')).toContain('manual')
  }, f.deps)
})
