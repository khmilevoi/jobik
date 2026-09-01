import { createContext, type ReactNode, useContext } from 'react'
import type { StudioModel } from './types.js'

/**
 * How a React tree reaches the Studio's model.
 *
 * **This is a plain React context and it is not `reatomContext`.** The two carry different things
 * and both are needed: `reatomContext` (`@reatom/react`) carries the Reatom *frame* and stays at
 * its default, so every unit created by `reatomStudio` lives in the one root frame; this context
 * carries the *model instance* — which `FlowsModel`, which `RunModel` — so a component can read
 * `model.run.session()` without every parent threading it through props. Nothing here subscribes to
 * anything: the value is one object created once by `reatomStudio`, so this provider never
 * re-renders its subtree.
 *
 * A component still reads atoms with `@reatom/react`'s own hooks and still wraps its event handlers
 * (RTM-C01, RTM-C02). This context only answers *which* model.
 */
const StudioModelContext = createContext<StudioModel | undefined>(undefined)

export interface StudioModelProviderProps {
  readonly model: StudioModel
  readonly children?: ReactNode
}

export function StudioModelProvider(props: StudioModelProviderProps) {
  return (
    <StudioModelContext.Provider value={props.model}>{props.children}</StudioModelContext.Provider>
  )
}

/**
 * The Studio model this subtree was given.
 *
 * **It throws when there is no provider above it, and that is deliberate.** `@jobik/ui` returns
 * expected failures as values and never throws them (see `model/types.ts`), but a missing provider
 * is not an expected failure — it is a component mounted outside the tree it was written for, which
 * no user action can cause and no runtime branch can recover from. Returning `undefined` here would
 * push that mistake into every call site as a narrowing that can never legitimately be taken. This
 * is the one exception to the error policy, and `pending` in `model/studio.ts` is the other half of
 * the same reading.
 */
export function useStudioModel(): StudioModel {
  const model = useContext(StudioModelContext)
  if (model === undefined) {
    throw new Error(
      '@jobik/ui: useStudioModel() was called outside a <StudioModelProvider>. Wrap the tree in <StudioModelProvider model={reatomStudio(deps)}>.',
    )
  }
  return model
}
