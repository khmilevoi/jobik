import { type Atom, type Ext, withComputed } from '@reatom/core'

/**
 * The two things this model layer needs from Reatom that Reatom does not supply.
 *
 * Neither is a model and neither holds state: they are the shapes four sub-model files had each
 * written out privately, because Waves 1 and 2 wrote those files in parallel and no agent owned a
 * second one. This module is where the wiring wave put the single copy.
 *
 * It is deliberately **not** on `model/index.ts`. That barrel is re-exported wholesale by
 * `packages/ui/src/index.ts`, so a line there would put both of these on `@jobik/ui`'s public
 * surface, and neither is anything a consumer should reach for.
 */

/**
 * `withComputed`, for an atom whose state includes `undefined`.
 *
 * Its callback is typed `(state: AtomState<Target>) => AtomState<Target>`, and `AtomState` reads the
 * target's `__state?` — an **optional** property, out of which TypeScript strips `undefined` when it
 * infers. So `Atom<string | undefined>` reports its own state as `string`, and every derived atom in
 * this package would meet that, because absence is written `undefined` throughout it.
 *
 * The cast is confined to this one function and changes nothing at run time: `withComputed` passes
 * the value straight back to the atom, which was declared to hold `undefined` in the first place.
 */
export function withOptionalComputed<T>(
  compute: (state: T | undefined) => T | undefined,
): Ext<Atom<T | undefined>> {
  return withComputed<Atom<T | undefined>>(compute as unknown as (state: T) => T)
}

/**
 * A promise nobody awaits, whose rejection is the call site's to swallow rather than the process's.
 *
 * Three modules start an async action from inside a synchronous transition — `model/validation.ts`
 * for the `3D` chip hold, `model/output.ts` for `3A`'s two button sequences, `model/flowSwitch.ts`
 * for `Save and switch` and `Cancel and switch`. The only rejection any of them can produce is the
 * `AbortError` `withAbort()` raises when a `reset` or a newer press supersedes the one in flight: a
 * cancelled hold is the machine working, not a failure. Every genuine failure in this package is a
 * value (`errore`), and anything that did throw is already on the action's own `.error()`;
 * re-raising it from here would only make it an unhandled rejection.
 */
export function detached(promise: Promise<unknown>): void {
  void promise.catch(() => {})
}
