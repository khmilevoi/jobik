import { action, atom, computed, throwAbort, withAsyncData, withComputed, wrap } from '@reatom/core'
import type { FlowListItem } from '#client/index.js'
import type { FlowsModel, StudioDeps } from './types.js'

/**
 * Flow discovery, the flow the Studio is pointed at, and the document behind it.
 *
 * This is the root of the model graph: it takes nothing but `deps`, and every other sub-model reads
 * from it. It is the Reatom form of the two mount effects and the two load callbacks that used to
 * live in `studio/useStudioSession.ts` — `discover`, `load`, `adopt` and `reloadFromDisk` — with the
 * three hand-rolled mechanisms those needed dissolved into the graph:
 *
 *  * **R5's two effects are two units.** The hook had to split discovery from load because one
 *    effect that read `flowId`, set it, and listed `flowId` among its own dependencies double-fired
 *    on mount. Here {@link FlowsModel.list} and {@link FlowsModel.loaded} are separate computeds and
 *    only `loaded` is keyed on `flowId`, so `GET /api/flows/:id` fires once per selected flow by
 *    construction rather than by arrangement.
 *
 *  * **`loadGenerationRef` is `withAbort`.** `withAsyncData` includes `withAbort('last-in-win')`, so
 *    a recompute — a flow switch, or a `reloadFromDisk` while the mount load is still open — aborts
 *    the computation it supersedes. The stale answer can no longer land over the fresher one, which
 *    is exactly what the ref counted generations to prevent, and nothing has to be counted.
 *
 *  * **`adopt` is gone, not ported.** It wrote four pieces of state at once because React had no
 *    other way to derive them; each is now a derivation in the module that owns it. What is left
 *    here is `descriptor`, and `model/draft.ts`, `model/inputs.ts` and `model/save.ts` take their
 *    own halves off `loaded` directly.
 *
 * Neither this file nor `model/extension.ts` imports another sub-model: `model/studio.ts` is the
 * one place that wires them together.
 */

/** One shared empty listing, so an absent or failed `list` does not hand out a new array identity. */
const NO_FLOWS: readonly FlowListItem[] = []

export function reatomFlows(deps: StudioDeps, name: string): FlowsModel {
  /**
   * `GET /api/flows`, once. `listFlows` follows the `T | Error` contract and never rejects, so the
   * `Error` arm is a value that lands in `.data()` rather than something `.error()` catches.
   */
  const list = computed(async () => await wrap(deps.client.listFlows()), `${name}.list`).extend(
    withAsyncData(),
  )

  const flows = computed(() => {
    const listed = list.data()
    return listed === undefined || listed instanceof Error ? NO_FLOWS : listed
  }, `${name}.flows`)

  /**
   * Discovery seeds this and nothing else does; after that it is ordinary writable state, which is
   * `withComputed`'s case (RTM-S02). `flows()` is read before the guard so the seed still tracks the
   * listing — a read placed after `return state` would never become a dependency and the first flow
   * would never arrive.
   */
  const flowId = atom<string | undefined>(undefined, `${name}.flowId`).extend(
    withComputed((state) => {
      const listed = flows()
      return state ?? listed[0]?.id
    }),
  )

  /**
   * `GET /api/flows/:id`, keyed on `flowId`. The document and the descriptor arrive together.
   *
   * `flowId()` is read synchronously at the top, before the first `await` (RTM-A07): a read below it
   * would never become a dependency and the flow would load once and never again.
   *
   * With no flow selected there is nothing to load and no answer to give. `throwAbort` says that
   * rather than inventing one: an abort writes neither `.data()` nor `.error()`, so `.data()` stays
   * `undefined` and no caller is handed an `Error` the server never produced.
   */
  const loaded = computed(async () => {
    const id = flowId()
    if (id === undefined) return throwAbort(`${name}.loaded: no flow is selected`)
    return await wrap(deps.client.loadFlow(id))
  }, `${name}.loaded`).extend(withAsyncData())

  /**
   * `loaded` narrowed to the descriptor — and only while it is a descriptor *of the flow now
   * selected*.
   *
   * `withAsyncData` keeps the last successful payload while the next request is in flight, so
   * without the id comparison a flow switch would leave the previous flow's canvas, node list and
   * start ids on screen under the new flow's id until its load resolved: the exact window
   * `selectFlow` cleared twelve pieces of state by hand to close. The server derives
   * `descriptor.id` from the same discovery id the route is keyed on (`server/descriptor.ts`), so
   * this comparison is the load's own answer to "which flow is this about", not a guess.
   *
   * A *reload* of the flow already open is deliberately not blanked by this: `Reload` answers a
   * document conflict, and emptying the canvas while it is in flight would be a second, unasked-for
   * loss.
   */
  const descriptor = computed(() => {
    const id = flowId()
    const payload = loaded.data()
    if (id === undefined || payload === undefined || payload instanceof Error) return undefined
    return payload.descriptor.id === id ? payload.descriptor : undefined
  }, `${name}.descriptor`)

  /**
   * `## UI and persistence`'s other half of the conflict offer: take what is on disk.
   *
   * `retry()` on a computed drops its dependencies and re-evaluates it, which is a fetch of the same
   * `flowId` — and, because `withAsyncData` carries `withAbort`, one that supersedes any load still
   * open. The rejection of a superseded promise is handled where it is raised, so the `catch` here
   * only keeps this call site from reporting an abort as an unhandled rejection.
   */
  const reloadFromDisk = action(() => {
    if (flowId() === undefined) return
    void loaded.retry().catch(() => {})
  }, `${name}.reloadFromDisk`)

  /**
   * Points the whole Studio at another flow. Immediate and never blocked — not by a dirty draft and
   * not by a run in flight. Asking a question first is a surface and belongs to `FlowSwitchModel`.
   *
   * The hook's version wrote twelve pieces of state; eleven of them were the other sub-models'
   * and are `reset` actions now, which `FlowSwitchModel.switchTo` calls before this one. What
   * remains is the id — and the guard, which is the reason this is still an action rather than a
   * bare `flowId.set` at the call site (RTM-S01): pressing the row of the flow already open is not
   * a transition, and must not restart its load.
   */
  const selectFlow = action((nextFlowId: string) => {
    if (nextFlowId === flowId()) return
    flowId.set(nextFlowId)
  }, `${name}.selectFlow`)

  return { list, flows, flowId, loaded, descriptor, reloadFromDisk, selectFlow }
}
