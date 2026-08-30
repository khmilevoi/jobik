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
