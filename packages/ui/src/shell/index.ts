// biome-ignore-all assist/source/organizeImports: barrels are append-only

// The directory's own custom properties; every `shell/**` stylesheet reads them. Imported here for
// the same reason `run/index.ts` imports its own: it is what puts the file in the module graph, so
// a bundler emits it. `shellTokens.css.test.ts` keeps it in step with `shellTokens.ts`.
import './shellTokens.css'

export type { DockedRunControlProps } from './DockedControls/DockedControls.js'
export { DockedFlowsControl, DockedRunControl } from './DockedControls/DockedControls.js'
export type {
  FlowNodeSummary,
  FlowSummary,
  FlowsSidebarProps,
  InventoryEntry,
} from './FlowsSidebar/FlowsSidebar.js'
export { FlowsSidebar } from './FlowsSidebar/FlowsSidebar.js'
export type { ChevronDirection, PanelHeaderProps } from './PanelHeader/PanelHeader.js'
export { Chevron, PanelHeader } from './PanelHeader/PanelHeader.js'
export type { RunDockProps } from './RunDock/RunDock.js'
export { RunDock } from './RunDock/RunDock.js'
export type { StudioFrameProps } from './StudioFrame/StudioFrame.js'
export { StudioFrame } from './StudioFrame/StudioFrame.js'
export type { TopBarProps } from './TopBar/TopBar.js'
export { TopBar } from './TopBar/TopBar.js'

// --- closeout finding 8-A: the run number in the docked header ---
export type { RunDockMetaTone } from './RunDock/RunDock.js'

// --- design sync: `2A` (`Studio — full page, output open`) ---
export type { RunHistoryEntry, SidebarNodeDotTone } from './FlowsSidebar/FlowsSidebar.js'
export type { RunDockStatus } from './RunDock/RunDock.js'
export { shellColors } from './shellTokens.js'

// --- design sync: `3D` (`Validate — press, then valid or invalid`) ---
// `ProblemsStripProps` is gone rather than deprecated: the strip reads `ValidationModel.problems`
// and `openReport` and takes no props, so there was nothing left for the type to describe.
// `ProblemRow` stays — `studio/problems.ts` builds those rows and the model carries them.
export type { ProblemRow, ProblemSeverity } from './ProblemsStrip/ProblemsStrip.js'
export { problemCountLabel, ProblemsStrip } from './ProblemsStrip/ProblemsStrip.js'
export type { StatusStripProps } from './StatusStrip/StatusStrip.js'
export { checkedAgo, StatusStrip } from './StatusStrip/StatusStrip.js'
export type { TopBarValidateState } from './TopBar/TopBar.js'

// --- design sync: `4A` coverage, F-C13 (the toast a settled run raises) ---
export { RunToast } from './RunToast/RunToast.js'
export { shellMetrics } from './shellTokens.js'
