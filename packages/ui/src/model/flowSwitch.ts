import { action, atom, computed, effect, withAsync, withConnectHook, wrap } from '@reatom/core'
import type { SwitchFlowBody } from '#modals/index.js'
import { formatElapsed } from '#studio/format.js'
import type {
  DraftModel,
  ExtensionModel,
  FlowSwitchModel,
  FlowsModel,
  InputsModel,
  OutputModel,
  RunModel,
  SaveModel,
  StudioDeps,
  ValidationModel,
} from './types.js'

/**
 * `3F` — the switch that asks first, and the reset that follows an answer.
 *
 * This is the one module that takes whole sub-models rather than single units, and it is the reason
 * it can: `switchTo` is the single place that calls every `reset`. In the hook that transition was
 * split in two — `useStudioSession.selectFlow` cleared twelve pieces of state and three refs,
 * `StudioApp.switchTo` cleared eight more — and both had to run in the same React event so no frame
 * painted one flow's state under another's id. Here it is one action (RTM-S04), and the batching
 * that React supplied by accident is what a named model action supplies on purpose.
 *
 * ## Why the guard is a surface and not a second kind of transition
 *
 * `flows.selectFlow` stays unconditional; `FlowsModel` deliberately has no `reset`, because moving
 * the id *is* its transition. Asking a question first is a modal, a held-back target and an answer,
 * and all three live here. A clean draft with no run in flight loses nothing, so `requestFlow` goes
 * straight through and the common case never sees a dialog.
 *
 * ## What replaced the `saveState` watcher
 *
 * `Save and switch` used to be two halves: an atom parked the target and an effect watched
 * `saveState` for it to stop being `saving`. `model/save.ts` makes that unnecessary — the promise
 * `save()` returns settles *after* `state` has been written on all four of its exits, and a refusal
 * leaves `state` untouched — so the continuation is straight-line code in {@link _saveAndSwitch}.
 * `saveAndSwitchTo` survives as what it always also was: the double-click guard, and the record of
 * which flow the write is being made on the way to.
 *
 * Nothing here imports a sibling model module. Every input arrives as one of the interfaces
 * `model/types.ts` declares, and `model/studio.ts` is the one place that hands over the instances.
 */

/**
 * A promise nobody awaits, whose rejection is this call site's to swallow rather than the process's.
 *
 * Copied from `model/validation.ts`, which needs the same thing for the same reason: an action
 * called from a synchronous transition returns a promise, and a floating one turns an ordinary
 * abort into an unhandled rejection. It wants hoisting into a shared module once a second wave
 * touches both files.
 */
function detached(promise: Promise<unknown>): void {
  void promise.catch(() => {})
}

export function reatomFlowSwitch(
  _deps: StudioDeps,
  input: {
    flows: FlowsModel
    draft: DraftModel
    save: SaveModel
    inputs: InputsModel
    validation: ValidationModel
    extension: ExtensionModel
    run: RunModel
    output: OutputModel
  },
  name: string,
): FlowSwitchModel {
  const { flows, draft, save, inputs, validation, extension, run, output } = input

  /** The flow whose row was pressed, held while the dialog stands. `undefined` is "no dialog". */
  const pendingFlowId = atom<string | undefined>(undefined, `${name}.pendingFlowId`)

  /**
   * The target a `Save and switch` is being made on the way to, held for as long as the write is in
   * flight. Two things read it: the re-entrancy guard in {@link saveAndSwitch}, and the auto-answer
   * below, which must not race the continuation for the same switch.
   */
  const saveAndSwitchTo = atom<string | undefined>(undefined, `${name}.saveAndSwitchTo`)

  /**
   * The transition itself, in the order that makes all three seeding behaviours come out right.
   *
   * **Every `reset` runs before `flows.selectFlow`, and that is the whole of it.** Moving `flowId`
   * is what re-keys `flows.loaded`, so the new flow's request is issued by the last line and its
   * payload lands some time after this action has returned. Two modules read their own state at
   * exactly that moment and would read the flow being left if the order were reversed:
   *
   *  * `model/inputs.ts` runs F10's `keepsRunSelection(previous, next)` on **every** landed load,
   *    with no origin flag to tell a load from a reload. `inputs.reset()` here puts `startId` back
   *    to `undefined`, which is what makes the predicate answer `false` for a switch — so a switch
   *    re-seeds from the new descriptor exactly as a mount does, while a reload, which never comes
   *    through here, still sees a live selection and keeps every typed character.
   *  * `run.reset()` bumps `generation`, which is what stops a run started under the previous flow
   *    writing anything onto the flow that replaced it. The stream keeps draining, so the server
   *    still settles that run; its events simply stop being written.
   *
   * There is no guard on `nextFlowId` here. {@link requestFlow} holds it, exactly as
   * `useStudioSession.selectFlow` did — pressing the row of the flow already open is not a
   * transition — and every other call site reaches this with a target the dialog is standing in
   * front of, which by construction is not the flow that is open.
   */
  const switchTo = action((nextFlowId: string) => {
    draft.reset()
    save.reset()
    inputs.reset()
    validation.reset()
    extension.reset()
    run.reset()
    output.reset()
    pendingFlowId.set(undefined)
    saveAndSwitchTo.set(undefined)
    flows.selectFlow(nextFlowId)
  }, `${name}.switchTo`)

  /**
   * What a sidebar flow row calls. `3F`: a switch that would lose something asks first; one that
   * would not goes straight through.
   */
  const requestFlow = action((nextFlowId: string) => {
    if (nextFlowId === flows.flowId()) return
    if (run.running() || draft.dirty()) {
      pendingFlowId.set(nextFlowId)
      return
    }
    switchTo(nextFlowId)
  }, `${name}.requestFlow`)

  /** `esc`, and the dialog's own dismiss. Nothing about the flow being left is touched. */
  const stay = action(() => {
    pendingFlowId.set(undefined)
    saveAndSwitchTo.set(undefined)
  }, `${name}.stay`)

  /** `Switch and keep running` and `Discard changes`: one behaviour, two labels for what it costs. */
  const switchToPending = action(() => {
    const target = pendingFlowId()
    if (target === undefined) return
    switchTo(target)
  }, `${name}.switchToPending`)

  /**
   * Order is load-bearing, and it is the one line pair in this file that cannot be swapped:
   * `run.cancel` reads `runToken` before its own first `await` and issues the request there, so the
   * request is already aimed at the run being left by the time `switchTo` clears that token.
   * Reversing these two would cancel nothing at all.
   */
  const cancelAndSwitch = action(() => {
    const target = pendingFlowId()
    if (target === undefined) return
    detached(run.cancel())
    switchTo(target)
  }, `${name}.cancelAndSwitch`)

  /**
   * The other half of `Save and switch`, and the whole of what used to be an effect watching
   * `saveState`.
   *
   * `save()`'s promise settles after `state` is written on every one of its four exits, so the
   * outcome is readable on the line after the `await`. A rejected write does not switch — a revision
   * conflict above all — and it closes the dialog too, because the conflict chip's own `Reload` and
   * `Copy draft` sit behind the scrim and are the only way out of that state.
   *
   * `target` arrives as a parameter rather than being read back off `pendingFlowId`: the read that
   * decides where this is going happens in {@link saveAndSwitch}, before the `await`, and a read
   * placed here would be answering a question about a world that has since moved (RTM-A07).
   */
  const _saveAndSwitch = action(async (target: string) => {
    await wrap(save.save())
    if (save.state().kind !== 'idle') {
      saveAndSwitchTo.set(undefined)
      pendingFlowId.set(undefined)
      return
    }
    // `switchTo` clears `saveAndSwitchTo` itself, as one of the two atoms this module resets. It is
    // deliberately still set on this line: the auto-answer below reads it as "a switch is already
    // under way", and a window in which it was clear and the draft was already clean would let that
    // reaction fire the same switch a second time.
    switchTo(target)
  }, `${name}._saveAndSwitch`).extend(withAsync())

  /**
   * The accent primary of the unsaved body. Every guard is here, before anything suspends:
   * `save()` refuses while a run streams and with no draft, and parking a target it will never move
   * would leave the continuation waiting on a write that never happened. The second clause is the
   * double-click guard, which `3F` supplied by hand in `StudioApp` for the same reason.
   */
  const saveAndSwitch = action(() => {
    const target = pendingFlowId()
    if (target === undefined || saveAndSwitchTo() !== undefined) return
    if (run.running() || draft.draft() === undefined) return
    saveAndSwitchTo.set(target)
    detached(_saveAndSwitch(target))
  }, `${name}.saveAndSwitch`)

  const pendingFlowName = computed(() => {
    const target = pendingFlowId()
    if (target === undefined) return undefined
    return flows.flows().find((flow) => flow.id === target)?.name ?? target
  }, `${name}.pendingFlowName`)

  /**
   * Which body `3F` draws, recomputed rather than frozen at the click: a dialog still claiming a run
   * is in flight after it has settled would be printing a stale elapsed time.
   *
   * **A run in flight wins over an unsaved draft.** `3F` draws the two bodies apart and does not say
   * which one a flow in both states gets; the tie-break is that `save()` refuses while a run
   * streams — the top bar hides both `Save` and the dirty dot for the same reason — so an unsaved
   * body offered there would carry a primary that does nothing at all.
   *
   * It carries its own actions because the pair *is* the body: `SwitchFlowBody`'s two arms differ in
   * what their ghost gives up, and a surface that had to re-pair them could pair them wrong. They
   * are Reatom actions, so the identities are stable and this stays a plain derivation.
   */
  const body = computed<SwitchFlowBody | undefined>(() => {
    const target = pendingFlowId()
    if (target === undefined) return undefined

    const session = run.session()
    if (run.running() && session !== undefined) {
      return {
        kind: 'running',
        runNumber: session.runNumber ?? 0,
        elapsed: formatElapsed(run.elapsedMs()),
        nodeId: run.runningNodeId() ?? inputs.startId() ?? '',
        onCancelAndSwitch: cancelAndSwitch,
        onSwitchAndKeepRunning: switchToPending,
      }
    }

    if (draft.dirty()) {
      return {
        kind: 'unsaved',
        documentFile: flows.descriptor()?.documentFile ?? '',
        unsavedChanges: draft.unsavedChanges(),
        onDiscardChanges: switchToPending,
        onSaveAndSwitch: saveAndSwitch,
      }
    }

    return undefined
  }, `${name}.body`).extend(
    /**
     * The dialog asks about a state that can end on its own — a run settles, a save lands. Once
     * nothing is at risk the question has answered itself, so the switch the user asked for
     * happens, rather than the dialog vanishing and leaving them where they were.
     *
     * RTM-L01/RTM-L02: the reaction is an `effect` created **inside** a connect hook, which is what
     * owns its lifetime and unsubscribes it — never a bare module-level `effect` with nothing above
     * it able to stop it. `body` is the right owner because `body` is what draws the dialog: the
     * question can only answer itself while something is there to ask it.
     */
    withConnectHook(() => {
      const answered = effect(() => {
        const target = pendingFlowId()
        const parked = saveAndSwitchTo()
        const atRisk = run.running() || draft.dirty()
        if (target === undefined || parked !== undefined || atRisk) return
        switchTo(target)
      }, `${name}._answered`)
      return () => answered.unsubscribe()
    }),
  )

  return {
    pendingFlowId,
    saveAndSwitchTo,
    pendingFlowName,
    body,
    requestFlow,
    switchTo,
    stay,
    switchToPending,
    cancelAndSwitch,
    saveAndSwitch,
  }
}
