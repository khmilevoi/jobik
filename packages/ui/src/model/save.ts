import { type Atom, action, atom, type Computed, withAsync, wrap } from '@reatom/core'
import { isRevisionConflictPayload, JobikServerError } from '#client/index.js'
import type { FlowDraft } from '#studio/draft.js'
import type { DraftModel, SaveModel, SaveState, StudioDeps } from './types.js'

/**
 * Writing the draft to disk, and the conflict it can come back with.
 *
 * ## `SaveState` stays four arms, and that is not RTM-A03
 *
 * RTM-A03 objects to a `loading`/`error` pair kept by hand beside an async unit, because
 * `withAsync` already models exactly that pair. `SaveState` is not that pair. It is a domain state
 * with four arms the UI renders differently: `idle` draws nothing, `saving` is the button's own
 * working state, `conflict` carries the two revisions `## UI and persistence`'s offer has to print,
 * and `error` carries the server's own `WireErrorPayload` so `StudioApp`'s save chip can show the
 * message the server actually sent. `save.ready()` plus `save.error()` can distinguish two of those
 * four and neither carries a payload, so the state stays.
 *
 * `withAsync` still earns its place beside it (RTM-A02), for the thing `SaveState` is not there to
 * do: `.ready()` is what a surface reads to draw `3A`'s working state, without any component
 * keeping a `saving` boolean of its own beside the button. What it is *not* is this action's own
 * re-entrancy guard — see the guard's own note below for the measurement behind that.
 *
 * ## The save-and-switch continuation
 *
 * `3F`'s `Save and switch` used to be two halves: a `saveAndSwitchTo` atom parked the target, and an
 * effect watched `saveState` for it to stop being `saving` and then decided whether to switch. That
 * is gone. `save` is an `AsyncAction`, so the whole thing is straight-line code inside one action:
 *
 * ```ts
 * await wrap(save())
 * if (save.state().kind !== 'idle') return   // a rejected write does not switch
 * switchTo(target)
 * ```
 *
 * The two guarantees that makes possible are stated here because they are this module's to keep:
 * the promise `save()` returns settles **after** `state` has been written, on every one of the four
 * paths out of the body; and a refusal — locked, no flow, no draft, already saving — leaves `state`
 * exactly as it found it, so a caller that awaited a refused save reads the state it already had
 * rather than a spurious `idle`.
 */
export function reatomSave(
  deps: StudioDeps,
  input: {
    flowId: Atom<string | undefined>
    draft: Atom<FlowDraft | undefined>
    markSaved: DraftModel['markSaved']
    locked: Computed<boolean>
  },
  name: string,
): SaveModel {
  const state = atom<SaveState>({ kind: 'idle' }, `${name}.state`)

  const save = action(async () => {
    // The double-click guard. `save()` had none of its own in the hook and `3F` supplied one by
    // hand with a parked-target atom, so a second write against the same `baseRevision` came back a
    // 409 the user never caused. It reads the `saving` arm rather than `!save.ready()`, and that is
    // measured rather than stylistic: `ready` is a lazily-recomputed `computed`, and a second press
    // issued in the *same synchronous tick* as the first reads a stale `true` from it unless
    // something already holds a subscription on `pending`. `saving` is written by this body before
    // it suspends, so the second call sees it with no subscriber anywhere. `.ready()` is still what
    // a surface reads to draw `3A`'s working state, which is why `withAsync` is here.
    if (state().kind === 'saving') return

    // RTM-A07, and the reason these three reads are one block above the first `await`: `locked`,
    // `flowId` and `draft` are all reactive, and a read placed after that `await` would never become
    // a dependency of this frame — it would silently observe whatever the world looked like when the
    // response landed. The hook said the same thing with a `useCallback` dependency list; here it is
    // position.
    if (input.locked()) return
    const flowId = input.flowId()
    const draft = input.draft()
    if (flowId === undefined || draft === undefined) return

    // R18: the exact document being sent, captured now. `markSaved` compares it by identity to
    // whatever the draft holds when the response arrives, which is what keeps an edit that landed
    // mid-flight instead of silently overwriting it.
    const sentDocument = draft.document

    state.set({ kind: 'saving' })
    const result = await wrap(deps.client.save(flowId, sentDocument, draft.baseRevision))

    if (result instanceof JobikServerError) {
      // `## UI and persistence`: on a revision conflict, offer reload or copy-draft. Never
      // overwrite, and never retry with the revision the server reported.
      if (isRevisionConflictPayload(result.payload)) {
        state.set({
          kind: 'conflict',
          expectedRevision: result.payload.expectedRevision,
          actualRevision: result.payload.actualRevision,
        })
        return
      }
      state.set({ kind: 'error', error: result.payload })
      return
    }
    // Not a rejection: `JobikClient` returns `T | Error` and never throws (see `model/types.ts`), so
    // this is a transport failure as a value. It has no server payload of its own, so it surfaces
    // as its own message rather than being dressed up as one.
    if (result instanceof Error) {
      state.set({ kind: 'error', error: { _tag: null, message: result.message } })
      return
    }

    input.markSaved(sentDocument, result.revision)
    state.set({ kind: 'idle' })
  }, `${name}.save`).extend(withAsync())

  /**
   * One of the twelve `reset`s `FlowSwitchModel.switchTo` calls in one batch. A conflict is about a
   * document in a flow, so it cannot outlive the flow it was reported for.
   */
  const reset = action(() => {
    state.set({ kind: 'idle' })
  }, `${name}.reset`)

  return { state, save, reset }
}
