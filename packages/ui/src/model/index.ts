/**
 * `@jobik/ui`'s Reatom model layer — the Studio's state, with no React in it.
 *
 * `types.ts` is the contract: one interface per sub-model, each factory's signature in its doc
 * comment, and the two conventions (`undefined` for absence, errors as values) every module
 * follows. `studio.ts` composes them. `context.tsx` carries one composed model through a React
 * tree, and is a plain context rather than `reatomContext`.
 *
 * An ordinary directory barrel, not append-only: edit it freely as modules land.
 */
export type { StudioModelProviderProps } from './context.js'
export { StudioModelProvider, useStudioModel } from './context.js'
export { reatomStudio } from './studio.js'
export type {
  AsyncAction,
  AsyncData,
  CanvasModel,
  DraftModel,
  ExtensionModel,
  FlowSwitchModel,
  FlowsModel,
  InputsModel,
  OutputModel,
  RetryState,
  RunModel,
  RunPanelModel,
  SaveModel,
  SaveState,
  ShortcutsModel,
  StudioDeps,
  StudioModel,
  StudioModelSlot,
  ValidationModel,
  ValidationState,
} from './types.js'
export { toFailurePayload } from './types.js'
