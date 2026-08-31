// biome-ignore-all assist/source/organizeImports: barrels are append-only
/** The Studio run panel: its four states, its controls, and its validation. */

// The directory's own custom properties, every `run/**` stylesheet reads them. Imported here for
// the same reason `globalStyles.tsx` imports `tokens.css`: it is what puts the file in the module
// graph, so a bundler emits it. `runPanelTokens.css.test.ts` keeps it in step with
// `runPanelTokens.ts`.
import './runPanelTokens.css'

export {
  formatAssetMeta,
  formatHiddenFrames,
  formatLastRunMeta,
  formatNodesComplete,
  formatRunMeta,
  formatStackFrame,
  runNodeStatusLabel,
} from './format.js'
export type {
  RunActionProps,
  RunDividerProps,
  RunDotShape,
  RunDotTone,
  RunSpinnerProps,
  RunStatusDotProps,
  RunWellProps,
  RunWellTone,
} from './RunChrome/RunChrome.js'
export { RunAction, RunDivider, RunSpinner, RunStatusDot, RunWell } from './RunChrome/RunChrome.js'
export type { RunCompletedViewProps } from './RunCompletedView/RunCompletedView.js'
export { RunCompletedView } from './RunCompletedView/RunCompletedView.js'
export type { RunFailedViewProps } from './RunFailedView/RunFailedView.js'
export { RunFailedView } from './RunFailedView/RunFailedView.js'
export type { RunIdleViewProps } from './RunIdleView/RunIdleView.js'
export { RunIdleView } from './RunIdleView/RunIdleView.js'
export type { RunInputControlProps } from './RunInputControl/RunInputControl.js'
export { RunInputControl } from './RunInputControl/RunInputControl.js'
export type {
  RunNodeRowsProps,
  RunNodeTimingsProps,
  RunTimingsVariant,
} from './RunNodeList/RunNodeList.js'
export { RunNodeRows, RunNodeTimings } from './RunNodeList/RunNodeList.js'
export type { RunPanelCardProps, RunPanelProps } from './RunPanel/RunPanel.js'
export { RunPanel, RunPanelCard } from './RunPanel/RunPanel.js'
export type { RunRunningViewProps } from './RunRunningView/RunRunningView.js'
export { RunRunningView } from './RunRunningView/RunRunningView.js'
export type { RunStateHeaderProps } from './RunStateHeader/RunStateHeader.js'
export { RunStateHeader } from './RunStateHeader/RunStateHeader.js'
export { runPanelColors, runPanelMetrics } from './runPanelTokens.js'
export * from './types.js'
export { collectRunInputValues, toRunInputIssues, validateRunInputs } from './validate.js'

// --- closeout finding 1: the ok node card's mono metadata row ---
export { assetMetaParts } from './format.js'
