import type { FlowDocument } from '@jobik/core'
import { atom, computed, context, withAsyncData, wrap } from '@reatom/core'
import { describe, expect, it, vi } from 'vitest'
import type { JobikClient, LoadedFlowPayload } from '#client/index.js'
import { reatomDraft } from './draft.js'
import type { StudioDeps } from './types.js'

/**
 * The draft model, driven directly inside `context.start()`.
 *
 * Every case below carries the name it had in `studio/useStudioSession.test.ts`, so the port is
 * auditable; the ones with no ancestor there are marked. Nothing renders: the model is a factory
 * precisely so a test can build one, drive it and read it without a component in the way.
 *
 * `loaded` and `locked` arrive as this factory's `input`, exactly as `model/studio.ts` will supply
 * them — a `computed(async)` extended with `withAsyncData()` for the first (which is what
 * `FlowsModel['loaded']` is) and a `computed` over a plain flag for the second (which is what
 * `RunModel.running` reaches every other sub-model as). Neither is a stub standing in for a real
 * unit; they are the real shapes, built here rather than imported from a sibling module.
 */

const DOCUMENT = {
  format: 'jobik.flow',
  version: 1,
  connections: [],
  literals: {},
  layout: { start1: { x: 0, y: 0 } },
} as unknown as FlowDocument

/** The same flow after a *document* edit made on disk — a card dragged, nothing else. */
const MOVED_DOCUMENT = {
  ...DOCUMENT,
  layout: { start1: { x: 800, y: 0 } },
} as unknown as FlowDocument

const DESCRIPTOR = {
  id: 'publication',
  name: 'publication',
  documentFile: 'flow.jobik.json',
  sourceFile: 'flow.ts',
  startIds: ['start1'],
  nodes: [],
} as unknown as LoadedFlowPayload['descriptor']

const DEPS: StudioDeps = {
  client: {} as unknown as JobikClient,
  now: () => 1000,
}

function loadedPayload(document: FlowDocument = DOCUMENT, revision = 'rev-1'): LoadedFlowPayload {
  return { descriptor: DESCRIPTOR, document, revision }
}

/**
 * One draft model, plus the two inputs the wiring task will hand it.
 *
 * `answer` is re-read on every load, so a test can point the second load at a different payload —
 * `reload()` is the only thing that re-runs the async computed, which is the model's own reason for
 * ever replacing a draft it is already holding.
 */
function harness(answer: () => LoadedFlowPayload | Error = () => loadedPayload()) {
  const running = atom(false, 'test.running')
  const locked = computed(() => running(), 'test.locked')
  const generation = atom(0, 'test.generation')
  const loadFlow = vi.fn(async () => answer())
  const loaded = computed(async () => {
    generation()
    return await wrap(loadFlow())
  }, 'test.loaded').extend(withAsyncData())

  const model = reatomDraft(DEPS, { loaded, locked }, 'test')

  return {
    model,
    running,
    loadFlow,
    /**
     * Drives the load and waits for it to land.
     *
     * It returns `wrap(...)`'s promise rather than an `async` function's, and that is load-bearing:
     * `await` on a bare promise resumes outside the Reatom frame `context.start` opened, so every
     * unit read after it would answer from a different frame than the one the model was built in.
     */
    load: () => wrap(loaded()),
    reload: () => {
      generation.set(generation() + 1)
      return wrap(loaded())
    },
  }
}

describe('loading', () => {
  // Ported from `loading` — the half about the draft. The `flowId`/`descriptor` assertions in the
  // original belong to `model/flows.ts` and are ported with it.
  it('lists flows and loads the first one into a clean draft', async () => {
    await context.start(async () => {
      const h = harness()
      await h.load()

      expect(h.model.draft()?.baseRevision).toBe('rev-1')
      expect(h.model.dirty()).toBe(false)
      expect(h.model.document()).toBe(DOCUMENT)
    })
  })

  // New: the hook cleared the draft from inside the load effect's continuation, so a failed load
  // was a branch it had to remember to skip. Here it is the derivation's own shape — the failed
  // answer is `loaded.data()` holding an `Error`, and the derivation keeps the state it has.
  it('keeps the draft it is holding when a load comes back an Error', async () => {
    await context.start(async () => {
      let fail = false
      const h = harness(() => (fail ? new Error('offline') : loadedPayload()))
      await h.load()
      // The draft that is on screen: read once, which is what a mounted surface does continuously.
      expect(h.model.draft()?.baseRevision).toBe('rev-1')

      fail = true
      await h.reload()

      expect(h.model.draft()?.baseRevision).toBe('rev-1')
      expect(h.model.document()).toBe(DOCUMENT)
    })
  })

  // New: `withComputed` is what makes a landed load replace the draft, and it is the whole of
  // `adopt`'s `setDraft` line. Asserted against the second load, because the first only seeds.
  it('seeds a fresh clean draft when a later load lands, dropping the edits on screen', async () => {
    await context.start(async () => {
      let revision = 'rev-1'
      let document = DOCUMENT
      const h = harness(() => loadedPayload(document, revision))
      await h.load()
      h.model.moveNode({ nodeId: 'start1', position: { x: 10, y: 20 } })
      expect(h.model.dirty()).toBe(true)

      revision = 'rev-9'
      document = MOVED_DOCUMENT
      await h.reload()

      expect(h.model.dirty()).toBe(false)
      expect(h.model.draft()?.baseRevision).toBe('rev-9')
      expect(h.model.document()).toBe(MOVED_DOCUMENT)
    })
  })
})

describe('editing', () => {
  it('marks the draft dirty on a node move', async () => {
    await context.start(async () => {
      const h = harness()
      await h.load()

      h.model.moveNode({ nodeId: 'start1', position: { x: 10, y: 20 } })

      expect(h.model.dirty()).toBe(true)
      expect(h.model.document()?.layout.start1).toEqual({ x: 10, y: 20 })
    })
  })

  it('marks the draft dirty on a new connection', async () => {
    await context.start(async () => {
      const h = harness()
      await h.load()

      h.model.connect({
        source: 'start1',
        sourceField: 'title',
        target: 'render',
        targetField: 'title',
      })

      expect(h.model.document()?.connections).toHaveLength(1)
      expect(h.model.dirty()).toBe(true)
    })
  })

  // New: `savedDocument` is why the run graph does not rebuild on every drag. The hook read it off
  // `draft?.savedDocument` at the call site; here it is a member, so it gets its own assertion.
  it('leaves the saved document where it was when a drag rewrites the draft', async () => {
    await context.start(async () => {
      const h = harness()
      await h.load()

      h.model.moveNode({ nodeId: 'start1', position: { x: 10, y: 20 } })

      expect(h.model.savedDocument()).toBe(DOCUMENT)
      expect(h.model.document()).not.toBe(DOCUMENT)
    })
  })

  // New, for `3F`'s `<n> unsaved changes`: a diff, not a tally. `studio/draft.ts` owns the counting
  // and its own tests cover the arithmetic; this asserts the model reads it off the live draft.
  it('counts the edits the draft is holding back, and none before one is made', async () => {
    await context.start(async () => {
      const h = harness()
      await h.load()
      expect(h.model.unsavedChanges()).toBe(0)

      h.model.moveNode({ nodeId: 'start1', position: { x: 10, y: 20 } })
      h.model.connect({
        source: 'start1',
        sourceField: 'title',
        target: 'render',
        targetField: 'title',
      })

      expect(h.model.unsavedChanges()).toBe(2)
    })
  })

  // New: there is no draft before the first load lands, and an edit arriving then is a canvas event
  // with nothing to apply it to — not a reason to invent one.
  it('ignores an edit made before any flow has loaded', async () => {
    await context.start(async () => {
      const h = harness()

      h.model.moveNode({ nodeId: 'start1', position: { x: 10, y: 20 } })

      expect(h.model.draft()).toBeUndefined()
      expect(h.model.unsavedChanges()).toBe(0)
    })
  })
})

describe('the run lock', () => {
  // Ported from `running` — the half about the draft's own two edits. The same case in the hook also
  // asserted that `validate`, `save` and `setInputField` are refused under the lock; those three
  // assertions are ported under this name into `model/validation.test.ts`, `model/save.test.ts` and
  // `model/inputs.test.ts`, each against the model that owns them.
  it('locks the draft while the run is in flight', async () => {
    await context.start(async () => {
      const h = harness()
      await h.load()
      h.running.set(true)

      h.model.moveNode({ nodeId: 'start1', position: { x: 10, y: 20 } })
      h.model.connect({
        source: 'start1',
        sourceField: 'title',
        target: 'render',
        targetField: 'title',
      })

      expect(h.model.dirty()).toBe(false)
      expect(h.model.document()).toBe(DOCUMENT)

      h.running.set(false)
      h.model.moveNode({ nodeId: 'start1', position: { x: 10, y: 20 } })
      expect(h.model.dirty()).toBe(true)
    })
  })
})

describe('markSaved', () => {
  // New at this level: the hook reached `markSaved` only through `save()`, and the two cases that
  // drove it are ported whole into `model/save.test.ts`. These two assert the rule itself — R18 —
  // against the action `SaveModel` calls, without a request in the way.
  it('clears dirty and adopts the new revision when the document it wrote is still the one held', async () => {
    await context.start(async () => {
      const h = harness()
      await h.load()
      h.model.moveNode({ nodeId: 'start1', position: { x: 5, y: 5 } })
      const sent = h.model.document() as FlowDocument

      h.model.markSaved(sent, 'rev-2')

      expect(h.model.dirty()).toBe(false)
      expect(h.model.draft()?.baseRevision).toBe('rev-2')
      expect(h.model.savedDocument()).toBe(sent)
    })
  })

  it('stays dirty when an edit landed after the document it wrote was captured', async () => {
    await context.start(async () => {
      const h = harness()
      await h.load()
      const sent = h.model.document() as FlowDocument
      h.model.moveNode({ nodeId: 'start1', position: { x: 9, y: 9 } })

      h.model.markSaved(sent, 'rev-2')

      expect(h.model.dirty()).toBe(true)
      expect(h.model.draft()?.baseRevision).toBe('rev-2')
      expect(h.model.document()?.layout.start1).toEqual({ x: 9, y: 9 })
    })
  })
})

describe('copyDraft', () => {
  // New: `## UI and persistence`'s second answer to a conflict. The hook exposed it and nothing
  // asserted it below `StudioApp`.
  it('puts the draft document on the clipboard, pretty-printed', async () => {
    const writeText = vi.fn(async (_text: string) => {})
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    await context.start(async () => {
      const h = harness()
      await h.load()
      h.model.moveNode({ nodeId: 'start1', position: { x: 5, y: 5 } })

      h.model.copyDraft()

      expect(writeText).toHaveBeenCalledTimes(1)
      expect(JSON.parse(writeText.mock.calls[0]?.[0] ?? '{}')).toEqual(h.model.document())
      expect(writeText.mock.calls[0]?.[0]).toContain('\n')
    })
  })

  it('has nothing to copy before a flow has loaded', async () => {
    const writeText = vi.fn(async (_text: string) => {})
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    await context.start(async () => {
      harness().model.copyDraft()

      expect(writeText).not.toHaveBeenCalled()
    })
  })
})

describe('reset', () => {
  // New: `selectFlow` cleared twelve pieces of state in one place; in the model each sub-model owns
  // its own clearing and `FlowSwitchModel.switchTo` calls all twelve. This is the draft's.
  it('drops the draft, and the load already landed does not put it back', async () => {
    await context.start(async () => {
      const h = harness()
      await h.load()
      h.model.moveNode({ nodeId: 'start1', position: { x: 5, y: 5 } })

      h.model.reset()

      expect(h.model.draft()).toBeUndefined()
      expect(h.model.document()).toBeUndefined()
      expect(h.model.savedDocument()).toBeUndefined()
      expect(h.model.dirty()).toBe(false)
      expect(h.model.unsavedChanges()).toBe(0)
    })
  })

  it('takes the next flow to land, so the switch it is half of finishes', async () => {
    await context.start(async () => {
      let revision = 'rev-1'
      const h = harness(() => loadedPayload(DOCUMENT, revision))
      await h.load()
      h.model.reset()

      revision = 'rev-7'
      await h.reload()

      expect(h.model.draft()?.baseRevision).toBe('rev-7')
      expect(h.model.dirty()).toBe(false)
    })
  })
})
