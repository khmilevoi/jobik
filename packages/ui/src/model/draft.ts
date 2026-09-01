import type { FlowDocument } from '@jobik/core'
import { action, atom, type Computed, computed, withComputed } from '@reatom/core'
import type { FieldConnection, NodeLayoutChange } from '#canvas/index.js'
import {
  markSaved as applyMarkSaved,
  moveNode as applyMoveNode,
  connectFields,
  createDraft,
  type FlowDraft,
  unsavedChangeCount,
} from '#studio/draft.js'
import type { DraftModel, FlowsModel, StudioDeps } from './types.js'

/**
 * The in-memory draft: dirty after an edit, written only on Save.
 *
 * `studio/draft.ts` is unchanged and is the whole of the reducer. Every edit here is that module's
 * pure function applied to the current value and written straight back, so what "dirty" means, what
 * an unsaved change counts as, and how a save that raced an edit resolves all still live in exactly
 * one place — one that this module consumes rather than re-states.
 *
 * **The draft is writable state derived from `loaded` (RTM-S02), not an effect that watches it.**
 * `withComputed` is what that shape is called: a landed load seeds a fresh
 * `createDraft(document, revision)`, and a direct write — every edit below — passes through and
 * stands until the next load changes `loaded.data()`. The hook did this with a `setDraft` inside
 * the load effect's continuation, which is why it also needed a generation counter to tell a stale
 * response from a live one; a derivation cannot land late, because there is nothing to land.
 *
 * `locked` is the run lock — `RunModel.running`, forwarded by `model/studio.ts`. This module names
 * no sibling module, which is why it and its siblings could be written at the same time.
 */
export function reatomDraft(
  _deps: StudioDeps,
  input: { loaded: FlowsModel['loaded']; locked: Computed<boolean> },
  name: string,
): DraftModel {
  const draft = atom<FlowDraft | undefined>(undefined, `${name}.draft`).extend(
    withComputed((state) => {
      const loaded = input.loaded.data()
      // `undefined` is the load that has not answered yet; an `Error` is the load that failed. The
      // hook kept the draft it had in both cases (`if (loaded instanceof Error) return`), because a
      // failed reload must not empty the canvas that is already on screen.
      if (loaded === undefined || loaded instanceof Error) return state
      return createDraft(loaded.document, loaded.revision)
    }),
  )

  const document = computed(() => draft()?.document, `${name}.document`)

  /**
   * Separate from `document` because the run graph depends on it: `savedDocument` changes only on a
   * load or a save, while `document` gets a new identity on every drag.
   */
  const savedDocument = computed(() => draft()?.savedDocument, `${name}.savedDocument`)

  const dirty = computed(() => draft()?.dirty === true, `${name}.dirty`)

  const unsavedChanges = computed(() => {
    const current = draft()
    return current === undefined ? 0 : unsavedChangeCount(current)
  }, `${name}.unsavedChanges`)

  /**
   * The draft lock, in the one place both edits can read it.
   *
   * A run in flight owns the document the server is executing, so an edit made under the stream
   * would move the canvas away from the run being drawn on it. `locked` is read synchronously —
   * both edits are synchronous actions, so RTM-A07 has nothing to catch here, but the same rule is
   * why `save` in `model/save.ts` reads it first thing.
   */
  const edit = (apply: (current: FlowDraft) => FlowDraft): void => {
    if (input.locked()) return
    const current = draft()
    if (current === undefined) return
    draft.set(apply(current))
  }

  const moveNode = action((change: NodeLayoutChange) => {
    edit((current) => applyMoveNode(current, change))
  }, `${name}.moveNode`)

  const connect = action((connection: FieldConnection) => {
    edit((current) => connectFields(current, connection))
  }, `${name}.connect`)

  /**
   * R18: the document is the one the save actually sent, captured at the press. `applyMarkSaved`
   * compares it by identity to whatever the draft holds now — an edit that landed while the write
   * was in flight adopts the new revision but keeps the draft dirty, instead of being silently
   * overwritten.
   *
   * Deliberately **not** guarded on `locked`: this is the answer to a write that was already
   * allowed, and refusing it because a run started meanwhile would leave the draft claiming to be
   * unsaved against a revision that no longer exists.
   */
  const markSaved = action((document: FlowDocument, revision: string) => {
    const current = draft()
    if (current === undefined) return
    draft.set(applyMarkSaved(current, document, revision))
  }, `${name}.markSaved`)

  /**
   * The conflict offer's second answer. Fire-and-forget by design: the clipboard write cannot fail
   * in a way this model renders, and `3C` gives the copy no state of its own — the button's own
   * `3A` copied/failed matrix is the surface that reports it, driven by the click, not by here.
   */
  const copyDraft = action(() => {
    const current = draft()
    if (current === undefined) return
    void globalThis.navigator?.clipboard?.writeText(JSON.stringify(current.document, null, 2))
  }, `${name}.copyDraft`)

  /**
   * Drops the draft. One of the twelve `reset`s `FlowSwitchModel.switchTo` calls in one batch, which
   * is how the hook's twelve-slot reset inside `selectFlow` is expressed once the state is a graph.
   *
   * Not an RTM-S01 identity setter: it takes no value to forward, and it is a named member of the
   * reset protocol every sub-model implements, not a wrapper someone reached for instead of
   * `draft.set(undefined)` at the call site.
   */
  const reset = action(() => {
    draft.set(undefined)
  }, `${name}.reset`)

  return {
    draft,
    document,
    savedDocument,
    dirty,
    unsavedChanges,
    moveNode,
    connect,
    markSaved,
    copyDraft,
    reset,
  }
}
