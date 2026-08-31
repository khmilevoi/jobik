/**
 * Re-export shim — **temporary, delete me**.
 *
 * `StripePlaceholder` moved into its own folder with the CSS Modules migration, but two files
 * outside this directory still import it by its old flat path while their own agents are
 * mid-migration: `src/output/ImageFrame.tsx` and `src/run/RunCompletedView/RunCompletedView.tsx`.
 * Breaking them from here would break somebody else's directory, so the old path keeps resolving
 * until those call sites move to `../canvas/StripePlaceholder/StripePlaceholder.js` — or, better,
 * to the `canvas/index.js` barrel. The last agent on this migration deletes this file.
 */
export type { StripePlaceholderProps } from './StripePlaceholder/StripePlaceholder.js'
export { StripePlaceholder } from './StripePlaceholder/StripePlaceholder.js'
