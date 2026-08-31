/**
 * Re-export shim, and a temporary one. Nothing in the append-only barrel names this path — but
 * `tokenDiscipline.test.tsx` imports `./RunningChip.js`, and that file is deliberately frozen for
 * the duration of the CSS Modules migration (it scans the rendered DOM for colour literals, which
 * a stylesheet no longer puts there, so it is vacuous and a later agent replaces it with the
 * static gate). This keeps its import resolving without editing it. Delete both together.
 */
export type {
  RunningChipProps,
  SaveConflictChipProps,
  SaveErrorChipProps,
} from './RunningChip/RunningChip.js'
export { RunningChip, SaveConflictChip, SaveErrorChip } from './RunningChip/RunningChip.js'
