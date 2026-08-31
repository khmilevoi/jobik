/**
 * Re-export shim. `packages/ui/src/index.ts` is append-only and names this exact path, so it must
 * keep resolving even though the component now lives in its own folder.
 */
export type { StudioProps } from './Studio/Studio.js'
export { Studio } from './Studio/Studio.js'
