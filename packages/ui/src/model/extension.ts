import { type Atom, computed, throwAbort, withAsyncData, wrap } from '@reatom/core'
import { loadFlowUi } from '#studio/extensionLoader.js'
import type { ExtensionModel, StudioDeps } from './types.js'

/**
 * The flow-local `flow.ui.tsx` bundle.
 *
 * `## Flow-local output UI`: a failure is not an error state. An absent renderer falls back to the
 * generic JSON viewer, and so does a broken one — which is why {@link ExtensionModel.descriptor}
 * narrows an `Error` to `undefined` instead of surfacing it.
 *
 * `studio/extensionLoader.ts` does the work and is unchanged: fetch the bundle, rewrite its bare
 * specifiers to shim modules built from the live namespaces, evaluate it, and check that its default
 * export is a `defineFlowUi()` descriptor. This module is only the *when*: a `computed(async)` keyed
 * on `flowId` (RTM-A01), not a mount-time fetch.
 *
 * **R29 does not carry over.** The hook read `externals` and `importModule` through refs because
 * `StudioApp` passed fresh literals on every render and re-rendered every 100ms while a run
 * streamed, so a dependency list naming them would have rebuilt the bundle on every tick. A model
 * has no render: they are plain fields on `StudioDeps`, read once per computation, and that hazard
 * cannot recur. The behaviour the ref bought — one fetch per flow, whatever the surface does — is
 * what the memoised computed gives for free.
 */
export function reatomExtension(
  deps: StudioDeps,
  input: { readonly flowId: Atom<string | undefined> },
  name: string,
): ExtensionModel {
  /**
   * Every reactive input is read synchronously at the top, before the first `await` (RTM-A07): a
   * read below it never becomes a dependency, and this one decides which flow is being loaded.
   *
   * With no flow selected there is no bundle to ask for. `throwAbort` says so without writing
   * `.data()` — an `Error` there would be indistinguishable from a bundle that genuinely failed.
   */
  const bundle = computed(async () => {
    const flowId = input.flowId()
    if (flowId === undefined) return throwAbort(`${name}.bundle: no flow is selected`)

    const url = deps.client.extensionBundleUrl(flowId)
    const { externals, importModule } = deps

    return await wrap(
      loadFlowUi({
        fetchBundle: async () => {
          const response = await fetch(url)
          if (!response.ok) throw new Error(`the server answered ${response.status}`)
          return response.text()
        },
        externals: externals ?? {},
        ...(importModule === undefined ? {} : { importModule }),
      }),
    )
  }, `${name}.bundle`).extend(withAsyncData())

  const descriptor = computed(() => {
    const loaded = bundle.data()
    return loaded === undefined || loaded instanceof Error ? undefined : loaded
  }, `${name}.descriptor`)

  /**
   * `withAsyncData`'s own reset already *is* this action — it drops the computed's dependencies and
   * puts `.data()` back to `undefined`, which is the whole of what a flow switch has to do to the
   * extension. Wrapping it in a second action that only called it would be an identity forwarder
   * (RTM-S01), so the model exposes the real one under its own name.
   */
  return { bundle, descriptor, reset: bundle.reset }
}
