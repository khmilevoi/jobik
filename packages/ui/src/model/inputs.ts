import { action, atom, type Computed, computed, peek, withComputed } from '@reatom/core'
import type * as z from 'zod'
import type { SafeFlowDescriptorPayload, SafeNodeDescriptorPayload } from '#client/index.js'
import type { RunInputDraft, RunInputDraftValue, RunInputIssue } from '#run/index.js'
import { toRunInputIssues, validateRunInputs } from '#run/index.js'
import {
  initialRunInputDraft,
  runInputPresentation,
  toRunInputSchema,
} from '#studio/inputSchema.js'
import { withOptionalComputed } from './reatom.js'
import type { FlowsModel, InputsModel, StudioDeps } from './types.js'

/**
 * The selected start, the typed run inputs, and what the last press found wrong with them.
 *
 * Everything here was `useStudioSession`'s `seedStart`/`adopt`/`selectStart`/`setInputField` and
 * `StudioApp`'s `inputIssues`/`runInputValues`/`reportInvalidInput`, which were two halves of one
 * subject: the panel is pointed at a start, holds a draft of that start's inputs, and reports what
 * the schema rejected. `studio/inputSchema.ts` and `run/validate.ts` are reused untouched — they
 * were already pure, and nothing about the shape of the state changes what they compute.
 */

/**
 * What the run panel is pointed at: the start it is on, and the descriptor that answer was judged
 * against.
 *
 * One value rather than two atoms because {@link keepsRunSelection} needs both together, and a
 * frame in which the id had moved but the descriptor had not would make the predicate lie.
 * `selectedNodeId` is deliberately absent: nothing can move it away from the selected start, so it
 * is a projection of `startId` and a predicate that keeps one valid keeps the other valid too.
 */
type RunSelection = {
  readonly descriptor: SafeFlowDescriptorPayload | undefined
  readonly startId: string | undefined
}

/**
 * F10 — whether a landed load leaves the run panel pointed at the same thing, and therefore whether
 * the input draft it is holding is still a draft *of* something.
 *
 * The draft is derived from the start node's **descriptor**, which is authored in TypeScript; the
 * document a reload replaces carries only `connections`, `literals` and `layout`. So the ordinary
 * reload — the one that answers a revision conflict — cannot invalidate a single typed character,
 * and re-seeding on it silently destroys work at the exact moment the UI asked the user to choose
 * between reloading and keeping it.
 *
 * Two things genuinely do invalidate it, and both are checked here:
 *
 *   * the selected start is no longer declared, or no longer has a node — there is nothing left
 *     for the draft to be a draft of, so the selection falls back to `startIds[0]`;
 *   * that start's input descriptor is no longer the same one — a field added, dropped, retyped or
 *     re-defaulted means a kept draft would disagree with the controls rendered from the new
 *     descriptor, which is worse than an empty one.
 *
 * Note what is *not* in the predicate: whether the start **set** changed. A flow that gained or
 * lost some other start says nothing about the start this panel is on, and clearing on that would
 * be the same gratuitous loss in a rarer costume.
 *
 * **It runs on every landed load, unconditionally**, which is the one thing that changed in the
 * move off React. The hook ran it only when `reloadFromDisk` passed a `previous`; here a mount load
 * and a flow switch both arrive with `startId === undefined` — `FlowSwitchModel.switchTo` calls
 * `reset` before the new flow's load lands — so the predicate already answers `false` for them and
 * no origin flag is needed to tell the three cases apart.
 *
 * The comparison is `JSON.stringify` because the descriptor arrives as parsed wire JSON produced by
 * one serialiser from one shape, so equal descriptors serialise identically. It is deliberately
 * conservative in the safe direction: the only failure mode is a false *negative*, which re-seeds.
 */
function keepsRunSelection(previous: RunSelection, next: SafeFlowDescriptorPayload): boolean {
  const { descriptor, startId } = previous
  if (descriptor === undefined || startId === undefined) return false
  if (!next.startIds.includes(startId)) return false
  const before = descriptor.nodes.find((node) => node.id === startId)
  const after = next.nodes.find((node) => node.id === startId)
  if (before === undefined || after === undefined) return false
  return JSON.stringify(before.input) === JSON.stringify(after.input)
}

/**
 * `_deps` is on the signature and unused: every sub-model factory takes the same three arguments so
 * `reatomStudio` wires them all the same way, and this one reaches nothing outside itself. The
 * schema, the seeding and the validation are all pure functions of the descriptor it is handed.
 */
export function reatomInputs(
  _deps: StudioDeps,
  input: {
    descriptor: Computed<SafeFlowDescriptorPayload | undefined>
    loaded: FlowsModel['loaded']
    locked: Computed<boolean>
  },
  name: string,
): InputsModel {
  const { descriptor, loaded, locked } = input

  /**
   * The descriptor of the load that actually landed — `undefined` while one is in flight and on a
   * failed load, because neither is a statement about what the panel should be pointed at.
   *
   * This is why `loaded` is an input and not `descriptor` alone: the seeding must key on a landed
   * payload, and errors are values here rather than throws, so the narrowing is explicit.
   */
  const _landed = computed<SafeFlowDescriptorPayload | undefined>(() => {
    const payload = loaded.data()
    return payload === undefined || payload instanceof Error ? undefined : payload.descriptor
  }, `${name}._landed`)

  /**
   * RTM-S02: writable state derived from another atom. A landed load re-points the panel unless
   * F10 says the selection survives it; `selectStart` and `reset` write it directly and the write
   * stands until the next load.
   */
  const _selection = atom<RunSelection>(
    { descriptor: undefined, startId: undefined },
    `${name}._selection`,
  ).extend(
    withComputed((state) => {
      const next = _landed()
      if (next === undefined) return state
      return keepsRunSelection(state, next)
        ? { descriptor: next, startId: state.startId }
        : { descriptor: next, startId: next.startIds[0] }
    }),
  )

  const startId = atom<string | undefined>(undefined, `${name}.startId`).extend(
    withOptionalComputed<string>(() => _selection().startId),
  )

  /**
   * The node the canvas and sidebar mark. It always holds `startId` — nothing in the Studio can
   * select a node that is not the selected start — so it follows rather than being written twice.
   */
  const selectedNodeId = atom<string | undefined>(undefined, `${name}.selectedNodeId`).extend(
    withOptionalComputed<string>(() => _selection().startId),
  )

  const startNode = computed<SafeNodeDescriptorPayload | undefined>(() => {
    const current = descriptor()
    const start = startId()
    if (current === undefined || start === undefined) return undefined
    return current.nodes.find((node) => node.id === start)
  }, `${name}.startNode`)

  /**
   * The signature of what the draft is a draft of — the start it belongs to and that start's own
   * input descriptor — and therefore the only thing whose change may throw a typed character away.
   *
   * `startNode` gets a fresh identity from every load, so seeding off it directly would re-seed on
   * the reload F10 exists to survive. This string does not change when the reload changes nothing
   * the draft depends on, and an unchanged computed does not invalidate its dependents.
   */
  const _draftSeed = computed<string | undefined>(() => {
    const node = startNode()
    // The separator is `\0`, written as an escape: no node id can contain one, so the two halves
    // cannot be confused for each other. It was a raw NUL byte in the source until the wiring wave,
    // which made git treat this whole file as binary — same string at run time, readable diff.
    return node === undefined ? undefined : `${node.id}\0${JSON.stringify(node.input)}`
  }, `${name}._draftSeed`)

  const inputDraft = atom<RunInputDraft>({}, `${name}.inputDraft`).extend(
    withComputed(() => {
      // The one dependency, deliberately: the signature above. `startNode` is read through `peek`
      // so its per-load identity churn never re-seeds a draft the user is still typing into.
      if (_draftSeed() === undefined) return {}
      const node = peek(startNode)
      return node === undefined ? {} : initialRunInputDraft(node.input)
    }),
  )

  const schema = computed<z.ZodObject | undefined>(() => {
    const node = startNode()
    return node === undefined ? undefined : toRunInputSchema(node.input)
  }, `${name}.schema`)

  const presentation = computed(() => {
    const node = startNode()
    return node === undefined ? undefined : runInputPresentation(node.input, inputDraft())
  }, `${name}.presentation`)

  /**
   * F02 — what the last press found wrong with the draft.
   *
   * It lives on the model rather than inside `RunIdleView` because four of the five run affordances
   * are not the panel's: `⌘↵`, the docked control, the top bar and `Retry node` all have to report
   * onto the same surface, and a finding held privately by the panel could never be shown for them.
   */
  const issues = atom<readonly RunInputIssue[] | undefined>(undefined, `${name}.issues`)

  const seedStart = action(
    (loadedDescriptor: SafeFlowDescriptorPayload, start: string | undefined) => {
      _selection.set({ descriptor: loadedDescriptor, startId: start })
      issues.set(undefined)
    },
    `${name}.seedStart`,
  )

  const selectStart = action((nextStartId: string) => {
    // The draft lock a run holds covers the start too: the run in flight *is* a run of the start
    // currently selected, and moving it under the stream would leave the panel describing one
    // start and the canvas another.
    if (locked()) return
    const current = descriptor()
    if (current === undefined) return
    if (nextStartId === startId()) return
    if (!current.startIds.includes(nextStartId)) return
    seedStart(current, nextStartId)
  }, `${name}.selectStart`)

  const setInputField = action((field: string, value: RunInputDraftValue) => {
    if (locked()) return
    inputDraft.set({ ...inputDraft(), [field]: value })
    // A finding is about the draft that produced it, so the next keystroke retires it.
    issues.set(undefined)
  }, `${name}.setInputField`)

  /**
   * R35/F02 — the one place the input draft becomes run values.
   *
   * It used to be hand-rolled as `Object.entries(draft).filter(v !== '')` at three call sites,
   * which can only ever produce strings; every affordance now routes through the same
   * `validateRunInputs`, so a run started from any of the five sends identical values.
   */
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
  }, `${name}.values`)

  const reportInvalid = action((error: Error) => {
    issues.set(toRunInputIssues(error))
  }, `${name}.reportInvalid`)

  const reset = action(() => {
    _selection.set({ descriptor: undefined, startId: undefined })
    issues.set(undefined)
  }, `${name}.reset`)

  return {
    startId,
    selectedNodeId,
    startNode,
    inputDraft,
    schema,
    presentation,
    issues,
    setInputField,
    selectStart,
    seedStart,
    values,
    reportInvalid,
    reset,
  }
}
