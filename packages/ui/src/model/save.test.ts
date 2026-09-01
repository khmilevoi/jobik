import type { FlowDocument } from '@jobik/core'
import { atom, computed, context, withAsyncData, wrap } from '@reatom/core'
import { describe, expect, it, vi } from 'vitest'
import type { JobikClient, LoadedFlowPayload, SavePayload } from '#client/index.js'
import { JobikServerError, JobikTransportError } from '#client/index.js'
import { reatomDraft } from './draft.js'
import { reatomSave } from './save.js'
import type { StudioDeps } from './types.js'

/**
 * The save model, driven directly inside `context.start()`.
 *
 * Every case whose name also appears in `studio/useStudioSession.test.ts` is a port of that case and
 * keeps its name; the rest are marked new and exist because the model has members the hook only
 * reached through `StudioApp`.
 *
 * **The draft here is the real `reatomDraft`, not a stand-in.** `SaveModel` takes `draft` and
 * `markSaved` as inputs, and the assertions being ported are about what the draft looks like once a
 * write lands — `dirty`, `baseRevision`. Wiring a hand-made atom and a hand-made `markSaved` would
 * be re-implementing `model/studio.ts` inside a test and would weaken exactly the assertions this
 * task is meant to carry across. Both modules are this task's, so composing them here names no
 * sibling module.
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
  nodes: [],
} as unknown as LoadedFlowPayload['descriptor']

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

type SaveFn = (
  flowId: string,
  document: FlowDocument,
  expectedRevision: string,
) => Promise<SavePayload | Error>

/**
 * One draft model and one save model, wired the way `model/studio.ts` will wire them, plus the two
 * inputs both of them take from elsewhere: `flowId` (the flows model's) and `locked`
 * (`RunModel.running`, forwarded).
 */
function harness(save: SaveFn = async () => ({ revision: 'rev-2' })) {
  const client = { save: vi.fn(save) } as unknown as JobikClient & {
    save: ReturnType<typeof vi.fn>
  }
  const deps: StudioDeps = { client, now: () => 1000 }

  const flowId = atom<string | undefined>('publication', 'test.flowId')
  const running = atom(false, 'test.running')
  const locked = computed(() => running(), 'test.locked')
  /**
   * What the next load answers with. A `let` rather than a unit: `retry()` drops the computation's
   * dependencies and re-runs it, so the reload case below changes this and asks for the answer
   * again, which is what `FlowsModel.reloadFromDisk` does to the real one.
   */
  let payload: LoadedFlowPayload = {
    descriptor: DESCRIPTOR,
    document: DOCUMENT,
    revision: 'rev-1',
  }
  // Annotated rather than inferred: `FlowsModel['loaded']` is an `AsyncData<LoadedFlowPayload |
  // Error>`, and a body that can only ever resolve a payload infers the narrower half of that union.
  const loaded = computed(
    async (): Promise<LoadedFlowPayload | Error> => await wrap(Promise.resolve(payload)),
    'test.loaded',
  ).extend(withAsyncData())

  const draft = reatomDraft(deps, { loaded, locked }, 'test.draft')
  const model = reatomSave(
    deps,
    { flowId, draft: draft.draft, markSaved: draft.markSaved, locked },
    'test.save',
  )

  return {
    model,
    draft,
    flowId,
    running,
    saved: client.save,
    /**
     * Returns `wrap(...)`'s promise, never an `async` function's: `await` on a bare promise resumes
     * outside the frame `context.start` opened, and every unit read after it would answer from a
     * different frame than the one these models were built in.
     */
    load: () => wrap(loaded()),
    /** A reload landing another revision of the same flow, as `Reload` on the conflict chip asks. */
    reload: (next: LoadedFlowPayload) => {
      payload = next
      return wrap(loaded.retry())
    },
  }
}

describe('validate and save', () => {
  it('clears dirty and adopts the new revision on save', async () => {
    await context.start(async () => {
      const h = harness()
      await h.load()
      h.draft.moveNode({ nodeId: 'start1', position: { x: 5, y: 5 } })

      await wrap(h.model.save())

      expect(h.draft.dirty()).toBe(false)
      expect(h.draft.draft()?.baseRevision).toBe('rev-2')
      expect(h.model.state()).toEqual({ kind: 'idle' })
    })
  })

  it('enters the conflict state on 409 and never overwrites', async () => {
    await context.start(async () => {
      const h = harness(async () => CONFLICT)
      await h.load()
      h.draft.moveNode({ nodeId: 'start1', position: { x: 5, y: 5 } })

      await wrap(h.model.save())

      expect(h.model.state()).toEqual({
        kind: 'conflict',
        expectedRevision: 'rev-1',
        actualRevision: 'rev-9',
      })
      expect(h.draft.dirty()).toBe(true)
      expect(h.saved).toHaveBeenCalledTimes(1)
    })
  })

  /**
   * New, and the other half of the conflict offer.
   *
   * `## UI and persistence` offers `Reload` or `Copy draft`, and `Reload` is the only escape from
   * the conflict state that stays in the flow. `useStudioSession.adopt` cleared `saveState` on
   * every landed load; here it is a derivation off the document on disk, so the chip goes when the
   * document it was about does — and a drag, which changes the draft but not the disk, leaves it
   * standing.
   */
  it('clears the conflict once a reload lands another revision, and a drag does not', async () => {
    await context.start(async () => {
      const h = harness(async () => CONFLICT)
      await h.load()
      h.draft.moveNode({ nodeId: 'start1', position: { x: 5, y: 5 } })
      await wrap(h.model.save())
      expect(h.model.state().kind).toBe('conflict')

      h.draft.moveNode({ nodeId: 'start1', position: { x: 6, y: 6 } })
      expect(h.model.state().kind).toBe('conflict')

      await h.reload({
        descriptor: DESCRIPTOR,
        document: { ...DOCUMENT, layout: { start1: { x: 900, y: 400 } } } as FlowDocument,
        revision: 'rev-9',
      })

      expect(h.model.state()).toEqual({ kind: 'idle' })
    })
  })

  // R18: `markSaved` compares the document actually sent, captured at call time, to the draft's
  // current document by identity. An edit that lands while the save is still in flight must not be
  // silently discarded: the new revision is adopted (so the next save targets the right base) but
  // the draft stays dirty.
  it('keeps a draft edit that lands while the save is still in flight', async () => {
    await context.start(async () => {
      let resolveSave: (value: SavePayload) => void = () => {}
      const gate = new Promise<SavePayload>((resolve) => {
        resolveSave = resolve
      })
      const h = harness(async () => gate)
      await h.load()

      const pending = h.model.save()
      expect(h.saved).toHaveBeenCalledTimes(1)

      h.draft.moveNode({ nodeId: 'start1', position: { x: 9, y: 9 } })
      resolveSave({ revision: 'rev-2' })
      await wrap(pending)

      expect(h.model.state()).toEqual({ kind: 'idle' })
      expect(h.draft.draft()?.baseRevision).toBe('rev-2')
      expect(h.draft.dirty()).toBe(true)
      expect(h.draft.document()?.layout.start1).toEqual({ x: 9, y: 9 })
    })
  })

  // New. R36: every non-409 failure is `kind: 'error'`, and the two kinds of failure are told apart
  // by what they carry. A `JobikServerError` hands over the server's own payload untouched.
  it('reports a rejected write as the payload the server actually sent', async () => {
    await context.start(async () => {
      const h = harness(
        async () =>
          new JobikServerError({
            reason: 'disk full',
            status: 500,
            payload: { _tag: 'FlowWriteError', message: 'no space left on device' },
          }),
      )
      await h.load()

      await wrap(h.model.save())

      expect(h.model.state()).toEqual({
        kind: 'error',
        error: { _tag: 'FlowWriteError', message: 'no space left on device' },
      })
      expect(h.draft.draft()?.baseRevision).toBe('rev-1')
    })
  })

  // New: a transport failure is a value, not a rejection (`JobikClient` never throws), and it has no
  // server payload — so it surfaces as its own message rather than being dressed up as one.
  it('reports a transport failure as its own message, with no server tag', async () => {
    await context.start(async () => {
      const unreachable = new JobikTransportError({ url: '/api/flows/publication/save' })
      const h = harness(async () => unreachable)
      await h.load()

      await wrap(h.model.save())

      // `_tag: null` is the honest answer: there is no server payload, because the server was never
      // reached. The message is the error's own, not a sentence this module invented for it.
      expect(h.model.state()).toEqual({
        kind: 'error',
        error: { _tag: null, message: unreachable.message },
      })
      expect(unreachable.message).toContain('/api/flows/publication/save')
    })
  })
})

describe('the run lock', () => {
  // Ported from `running` — the half about `save()`. The same case in the hook also asserted that
  // `validate`, `setInputField` and the draft's own two edits are refused under the lock; those
  // assertions are ported under this name into `model/validation.test.ts`, `model/inputs.test.ts`
  // and `model/draft.test.ts`, each against the model that owns them.
  it('locks the draft while the run is in flight', async () => {
    await context.start(async () => {
      const h = harness()
      await h.load()
      h.running.set(true)

      await wrap(h.model.save())

      expect(h.saved).not.toHaveBeenCalled()
      expect(h.model.state()).toEqual({ kind: 'idle' })

      h.running.set(false)
      await wrap(h.model.save())
      expect(h.saved).toHaveBeenCalledTimes(1)
    })
  })
})

describe('refusals', () => {
  // New: the hook's three early returns, each of which `3F` had to reproduce by hand before it could
  // park a target that `save()` would never move.
  it('writes nothing with no flow selected', async () => {
    await context.start(async () => {
      const h = harness()
      await h.load()
      h.flowId.set(undefined)

      await wrap(h.model.save())

      expect(h.saved).not.toHaveBeenCalled()
    })
  })

  it('writes nothing before a flow has loaded', async () => {
    await context.start(async () => {
      const h = harness()

      await wrap(h.model.save())

      expect(h.saved).not.toHaveBeenCalled()
      expect(h.model.state()).toEqual({ kind: 'idle' })
    })
  })

  // New, and the reason `withAsync` is on this action at all (RTM-A02). `3F` supplied this guard by
  // hand, with a parked-target atom, because the hook's `save()` had none: a second press in the
  // same tick wrote twice against one `baseRevision` and the second came back a 409 the user never
  // caused. `.ready()` is false for the first call from the moment its body starts.
  it('ignores a second press issued before the first write has answered', async () => {
    await context.start(async () => {
      let resolveSave: (value: SavePayload) => void = () => {}
      const gate = new Promise<SavePayload>((resolve) => {
        resolveSave = resolve
      })
      const h = harness(async () => gate)
      await h.load()

      const first = h.model.save()
      const second = h.model.save()
      resolveSave({ revision: 'rev-2' })
      await wrap(Promise.all([first, second]))

      expect(h.saved).toHaveBeenCalledTimes(1)
      expect(h.model.state()).toEqual({ kind: 'idle' })
    })
  })

  // New: a refusal must leave the state alone, or the straight-line `Save and switch` below would
  // read a spurious `idle` off a write that never happened and switch away from an unsaved draft.
  it('leaves a standing conflict untouched when a later press is refused', async () => {
    await context.start(async () => {
      const h = harness(async () => CONFLICT)
      await h.load()
      await wrap(h.model.save())
      expect(h.model.state().kind).toBe('conflict')

      h.running.set(true)
      await wrap(h.model.save())

      expect(h.model.state()).toEqual({
        kind: 'conflict',
        expectedRevision: 'rev-1',
        actualRevision: 'rev-9',
      })
    })
  })
})

describe('save and switch', () => {
  /**
   * New, and the point of this task.
   *
   * `3F`'s `Save and switch` used to be an atom that parked the target plus an effect that watched
   * `saveState` for it to stop being `saving`. `save` is an `AsyncAction` now, so the continuation
   * is straight-line: await the write, read the outcome, decide. These two cases assert the only
   * thing that shape needs from this module — that the promise settles *after* the state is
   * written, on both the accepted and the rejected path — so that a caller which awaits it never
   * reads `saving` and never has to wait for a second frame.
   */
  it('has settled its state by the time the promise resolves, so the continuation can decide', async () => {
    await context.start(async () => {
      const h = harness()
      await h.load()
      h.draft.moveNode({ nodeId: 'start1', position: { x: 5, y: 5 } })

      let switched = false
      await wrap(h.model.save())
      if (h.model.state().kind === 'idle') switched = true

      expect(switched).toBe(true)
      expect(h.draft.dirty()).toBe(false)
    })
  })

  it('reports the conflict on the same await, so a rejected write does not switch', async () => {
    await context.start(async () => {
      const h = harness(async () => CONFLICT)
      await h.load()
      h.draft.moveNode({ nodeId: 'start1', position: { x: 5, y: 5 } })

      let switched = false
      await wrap(h.model.save())
      if (h.model.state().kind === 'idle') switched = true

      expect(switched).toBe(false)
      expect(h.model.state().kind).toBe('conflict')
      expect(h.draft.dirty()).toBe(true)
    })
  })
})

describe('reset', () => {
  // New: one of the twelve `reset`s `FlowSwitchModel.switchTo` calls, which is how the hook's
  // twelve-slot clearing inside `selectFlow` is expressed once the state is a graph. A conflict is
  // about a document in a flow and cannot outlive the flow it was reported for.
  it('drops a standing conflict when the flow it was reported for is left', async () => {
    await context.start(async () => {
      const h = harness(async () => CONFLICT)
      await h.load()
      await wrap(h.model.save())
      expect(h.model.state().kind).toBe('conflict')

      h.model.reset()

      expect(h.model.state()).toEqual({ kind: 'idle' })
    })
  })
})
