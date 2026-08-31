/**
 * The four dialogs artboard `3C` fixes — Validation, Download output, Stack trace, Cancel run —
 * the `3F` Switch-flow confirm that reuses their chrome, and the shell all five compose.
 *
 * Two stylesheets are pulled in here rather than by a component, the way `output/index.ts` pulls
 * `outputTokens.css`: this directory's own token pair, and `canvas/canvasTokens.css`, because the
 * Download modal's file rows draw their thumbnails with `canvas/StripePlaceholder` and a custom
 * property exists only while the stylesheet declaring it is on the page.
 *
 * `primitives/` supplies the buttons, the spinner and the four icons, and puts its own
 * `primitiveTokens.css` on the page through its barrel.
 */
// Side-effect stylesheet imports stay relative, the way `output/index.ts` and `studio/RunningChip`
// write theirs; only module specifiers go through the `#` subpath map.
import '../canvas/canvasTokens.css'
import './modalTokens.css'

export type { CancelRunModalProps } from './CancelRunModal/CancelRunModal.js'
export { CancelRunModal, cancelRunMessage } from './CancelRunModal/CancelRunModal.js'
export type {
  DownloadFile,
  DownloadFormat,
  DownloadModalProps,
} from './DownloadModal/DownloadModal.js'
export { DownloadModal, downloadFormats } from './DownloadModal/DownloadModal.js'
export type {
  ModalBodyGap,
  ModalHeaderSpec,
  ModalShellProps,
  ModalWidth,
} from './ModalShell/ModalShell.js'
export { ModalShell } from './ModalShell/ModalShell.js'
export { modalColors, modalMetrics } from './modalTokens.js'
export type { ProseSegment, ProseTextProps, ProseTone } from './ProseText/ProseText.js'
export { ProseText } from './ProseText/ProseText.js'
export type {
  StackTraceMetaEntry,
  StackTraceMetaTone,
  StackTraceModalProps,
} from './StackTraceModal/StackTraceModal.js'
export { StackTraceModal } from './StackTraceModal/StackTraceModal.js'
export type {
  SwitchFlowBody,
  SwitchFlowModalProps,
} from './SwitchFlowModal/SwitchFlowModal.js'
export {
  SwitchFlowModal,
  switchFlowRunningMessage,
  switchFlowRunningMeta,
  switchFlowUnsavedMessage,
  switchFlowUnsavedMeta,
} from './SwitchFlowModal/SwitchFlowModal.js'
export type {
  ValidationAction,
  ValidationActionTone,
  ValidationFinding,
  ValidationModalProps,
  ValidationSeverity,
} from './ValidationModal/ValidationModal.js'
export { ValidationModal } from './ValidationModal/ValidationModal.js'
