import { reatomComponent } from '@reatom/react'
import { type ReactNode, useState } from 'react'
import { cx } from '#cx.js'
import type {
  FlowNodeSummary,
  FlowSummary,
  InventoryEntry,
  RunDockMetaTone,
  RunDockStatus,
  RunHistoryEntry,
  TopBarValidateState,
} from '#shell/index.js'
import { DockedRunControl, FlowsSidebar, RunDock, StudioFrame, TopBar } from '#shell/index.js'
import s from './Studio.module.css'

/** The artboard's own data (design lines 68–122). A default, not a hard-coded body. */
const FIXTURE_FLOWS: readonly FlowSummary[] = [
  { id: 'publication', name: 'publication', nodeCount: 3 },
  { id: 'digest', name: 'digest', nodeCount: 5 },
  { id: 'backfill', name: 'backfill', nodeCount: 2 },
]

const FIXTURE_NODES: readonly FlowNodeSummary[] = [
  { id: 'start1', kind: 'start', dot: 'start' },
  { id: 'render', kind: 'transform', dot: 'neutral' },
  { id: 'publish', kind: 'sink', dot: 'neutral' },
]

const FIXTURE_INVENTORY: readonly InventoryEntry[] = [
  { name: 'start<T>', kind: 'entry' },
  { name: 'markdown', kind: 'transform' },
  { name: 'imageOut', kind: 'renderer' },
  { name: 'httpSink', kind: 'sink' },
]

export interface StudioProps {
  readonly flows?: readonly FlowSummary[]
  readonly activeFlowId?: string
  /** Points the Studio at the flow a sidebar row names. Absent leaves the rows inert. */
  readonly onSelectFlow?: (flowId: string) => void
  /**
   * `3E` note 04 — the `Flows` list drops to 45% and answers nothing while a switch is blocked.
   * Its one occupant is the window while another flow is loading; `3F` sends the dirty-draft and
   * live-run cases to the switch dialog instead. Absent is the ordinary answering list.
   */
  readonly flowsBlocked?: boolean
  /**
   * The flow's own file, as the descriptor names it — `index.ts` for the showcase's `publication`.
   * There is no default: the descriptor is absent for the whole initial-load frame, and a stand-in
   * name would be indistinguishable from a real one. Absent means the top bar shows no badge.
   */
  readonly flowFile?: string
  readonly dirty?: boolean
  readonly nodes?: readonly FlowNodeSummary[]
  readonly selectedNodeId?: string
  /** Points the run panel at another declared start, from the sidebar's `Start` section. */
  readonly onSelectStart?: (nodeId: string) => void
  readonly inventory?: readonly InventoryEntry[]
  readonly entryNodeId?: string
  /** One of `accentAlternates`, or the default `#1fd6bd`. */
  readonly accent?: string
  /** P7 fills this. The default is an empty flex slot with no canvas styling of its own. */
  readonly canvas?: ReactNode
  /** P11 fills this. */
  readonly runPanel?: ReactNode
  /**
   * The run number the dock header shows in place of its chevron once a run exists — `#219` in
   * flight, `#220 · 0.8s` settled. `RunDock` owns the treatment; this only carries it down.
   */
  readonly runMeta?: string
  readonly runMetaTone?: RunDockMetaTone
  /**
   * `2A`: once a run has settled the dock header's left half becomes `● Completed` / `● Run failed`
   * rather than `Run <entry>`. Absent while idle or in flight, which is what both other artboards
   * draw.
   */
  readonly runStatus?: RunDockStatus
  /** `2A`'s left-sidebar `Run history` rows. Absent leaves the `Inventory` section in place. */
  readonly runs?: readonly RunHistoryEntry[]
  readonly selectedRunId?: string
  readonly onSelectRun?: (id: string) => void
  readonly running?: boolean
  /** The slot the running chip occupies. No plan owns the chip's markup yet. */
  readonly runningChip?: ReactNode
  /** `3D` — the Validate control's cell. Absent is `idle`, which every artboard but `3D` draws. */
  readonly validate?: TopBarValidateState
  /**
   * `3D` §3D.3 — the status or problems strip, across the bottom of the frame. Absent until a
   * check has produced a result; see `shell/StatusStrip`.
   */
  readonly status?: ReactNode
  /**
   * `3D` — *"Run is disabled while any error stands; warnings never block it."* Dims the run chip
   * to 45 % and stops it responding, which is `3B`'s treatment for a button the surface has
   * already spoken for.
   */
  readonly runBlocked?: boolean
  readonly onValidate?: () => void
  /** `3D` — the invalid cell's `report` chip and the strip's `Open report` both land here. */
  readonly onOpenReport?: () => void
  readonly onSave?: () => void
  readonly onRun?: () => void
}

/**
 * The frame, and the only two pieces of state that are genuinely its own.
 *
 * It is a `reatomComponent` so that a subtree rendered through its slots can read the model without
 * this component standing between the read and the re-render — but it reads nothing itself, and it
 * is not going to: **every value it draws arrives as a prop**, with an artboard fixture as the
 * default, which is what lets `Studio.test.tsx` drive it with no server and no model at all.
 * `leftCollapsed` and `rightCollapsed` stay `useState`: which sidebars this instance has docked is
 * not a fact about the flow, the run or the document, and putting it on the model would make two
 * Studios in one page share one layout.
 */
export const Studio = reatomComponent(function Studio(props: StudioProps) {
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)

  const flows = props.flows ?? FIXTURE_FLOWS
  const activeFlowId = props.activeFlowId ?? flows[0]?.id ?? ''
  const nodes = props.nodes ?? FIXTURE_NODES
  const inventory = props.inventory ?? FIXTURE_INVENTORY
  const entryNodeId = props.entryNodeId ?? 'start1'
  const activeFlow = flows.find((flow) => flow.id === activeFlowId)
  const running = props.running === true
  /**
   * `3B`: a control dims to 45% whenever something around it already reports progress. A run in
   * flight is exactly that, so the run chip is blocked while one streams as well as while
   * validation stands in the way.
   */
  const runBlocked = props.runBlocked === true || running

  return (
    <StudioFrame
      accent={props.accent}
      topBar={
        <TopBar
          flowName={activeFlow?.name ?? activeFlowId}
          flowFile={props.flowFile}
          dirty={props.dirty ?? true}
          running={props.running}
          runningChip={props.runningChip}
          {...(props.validate === undefined ? {} : { validate: props.validate })}
          onValidate={props.onValidate}
          onOpenReport={props.onOpenReport}
          onSave={props.onSave}
          leftCollapsed={leftCollapsed}
          onToggleLeft={() => setLeftCollapsed((collapsed) => !collapsed)}
          rightCollapsed={rightCollapsed}
          onToggleRight={() => setRightCollapsed((collapsed) => !collapsed)}
          // `Studio — run in progress` (design 1706–1714) puts exactly three things in the actions
          // cluster: the running pill, then `Validate` and `Save` at 45%. There is no `Run start1`
          // pill beside the chip — while a run streams the chip *is* the run affordance, and a
          // second one would offer a second run over the first. Hence `running` alone drops this
          // slot. Collapsing the right panel does not: the pill is the only way to start a run, so
          // it stays put regardless of which panels are open, and `runBlocked` dims its accent chip
          // instead whenever the surface has already spoken for it, which is `3B`'s rule.
          runControl={
            running ? undefined : (
              <DockedRunControl
                entryNodeId={entryNodeId}
                onRun={props.onRun}
                runBlocked={runBlocked}
              />
            )
          }
        />
      }
      left={
        <div
          data-testid="studio-left-panel"
          className={cx(s.panelSlot, s.panelSlotLeft, leftCollapsed && s.panelSlotCollapsed)}
          aria-hidden={leftCollapsed || undefined}
          inert={leftCollapsed}
        >
          <FlowsSidebar
            flows={flows}
            activeFlowId={activeFlowId}
            {...(props.onSelectFlow === undefined ? {} : { onSelectFlow: props.onSelectFlow })}
            blocked={props.flowsBlocked === true}
            nodes={nodes}
            selectedNodeId={props.selectedNodeId ?? entryNodeId}
            {...(props.onSelectStart === undefined ? {} : { onSelectStart: props.onSelectStart })}
            inventory={inventory}
            {...(props.runs === undefined ? {} : { runs: props.runs })}
            {...(props.selectedRunId === undefined ? {} : { selectedRunId: props.selectedRunId })}
            {...(props.onSelectRun === undefined ? {} : { onSelectRun: props.onSelectRun })}
          />
        </div>
      }
      canvas={props.canvas ?? <div data-testid="studio-canvas-slot" className={s.canvasSlot} />}
      right={
        <div
          data-testid="studio-right-panel"
          className={cx(s.panelSlot, s.panelSlotRight, rightCollapsed && s.panelSlotCollapsed)}
          aria-hidden={rightCollapsed || undefined}
          inert={rightCollapsed}
        >
          <RunDock
            entryNodeId={entryNodeId}
            {...(props.runMeta === undefined ? {} : { runMeta: props.runMeta })}
            {...(props.runMetaTone === undefined ? {} : { runMetaTone: props.runMetaTone })}
            {...(props.runStatus === undefined ? {} : { runStatus: props.runStatus })}
          >
            {props.runPanel}
          </RunDock>
        </div>
      }
      {...(props.status === undefined ? {} : { status: props.status })}
    />
  )
}, 'Studio')
