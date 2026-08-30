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
