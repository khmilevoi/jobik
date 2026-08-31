/**
 * Re-export shim — **temporary, delete me**.
 *
 * `NodeOutputSlot` moved into its own folder with the CSS Modules migration, and
 * `src/output/GenericOutput.test.tsx` still imports it by its old flat path while the output
 * directory is mid-migration. See the note in `StripePlaceholder.ts`; the last agent deletes both.
 */
export type { NodeOutputSlotProps } from './NodeOutputSlot/NodeOutputSlot.js'
export { NodeOutputSlot } from './NodeOutputSlot/NodeOutputSlot.js'
