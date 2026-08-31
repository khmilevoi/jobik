/**
 * Re-export shim. `packages/ui/src/index.ts` is append-only and names this exact path, so it must
 * keep resolving even though the component now lives in its own folder.
 */
export type { StudioAppProps } from './StudioApp/StudioApp.js'
export { StudioApp } from './StudioApp/StudioApp.js'
