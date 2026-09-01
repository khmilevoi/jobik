// biome-ignore-all assist/source/organizeImports: plan-provenance blocks are append-only
/**
 * `@jobik/ui` browser surface. Named imports only — `import { defineFlowUi } from '@jobik/ui'`.
 *
 * APPEND-ONLY. Each plan appends its own `export` lines and edits no existing line.
 */

// --- P4 ui-shell ---
export { STUDIO_GLOBAL_CSS, StudioStyles } from './globalStyles.js'
export * from './primitives/index.js'
export * from './shell/index.js'
export type { StudioProps } from './studio/Studio.js'
export { Studio } from './studio/Studio.js'
export * from './tokens.js'

// --- P7 ui-canvas ---
// Mounting `FlowCanvas` outside the bundled Studio also needs React Flow's base stylesheet:
// `import '@xyflow/react/dist/style.css'`.
export * from './canvas/index.js'

// --- P11 ui-run-panel ---
// `RunPanel` fills `RunDock`'s body: it returns a fragment so the dock keeps supplying the
// `16px 14px` padding and the `16px` gap. `RunPanelCard` is the standalone artboard card.
export * from './run/index.js'

// --- P12 ui-output-viewer ---
// `defineFlowUi` ships on this existing entry point; a `flow.ui.tsx` imports it by name.
export * from './output/index.js'

// --- P14 studio-integration ---
export * from './client/index.js'
export type { StudioAppProps } from './studio/StudioApp.js'
export { StudioApp } from './studio/StudioApp.js'

// --- design-sync modals ---
// Artboard `3C`: the four dialogs — Validation, Download output, Stack trace, Cancel run — plus
// the `ModalShell` they compose. Presentational: every action is a callback.
export * from './modals/index.js'

// --- design-sync flow switching ---
// Artboard `3F`: the `Switch flow` confirm — one modal, two bodies, guarding a switch that would
// drop an unsaved draft or leave a run running with nothing left to cancel it. It also reaches
// consumers through the `./modals/index.js` star export above; named here so this barrel states it.
//
// `SwitchFlowModalProps` was removed from this block by explicit operator decision when the dialog
// was converted to read `packages/ui/src/model/`: it takes no props, so the type described nothing
// and this line exported nothing. That is the ONE authorised edit to this append-only barrel and it
// is not a precedent — every other line here, and the other two barrels, stay append-only.
// `SwitchFlowBody` stays: it is the shape `FlowSwitchModel.body` computes.
export type { SwitchFlowBody } from './modals/SwitchFlowModal/SwitchFlowModal.js'
export { SwitchFlowModal } from './modals/SwitchFlowModal/SwitchFlowModal.js'

// --- reatom-model foundation ---
// The browser layer's Reatom model. `model/types.ts` is the contract every sub-model is written
// against — one interface per module, each factory's signature stated in its own doc comment — and
// `reatomStudio` composes them. `StudioModelProvider`/`useStudioModel` carry one composed model
// through a React tree; that is a plain React context, NOT `reatomContext`, which carries the
// Reatom frame and stays at its default.
export * from './model/index.js'
