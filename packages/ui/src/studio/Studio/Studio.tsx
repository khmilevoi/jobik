import { type ReactNode, useState } from 'react'
import type {
  FlowNodeSummary,
  FlowSummary,
  InventoryEntry,
  RunDockMetaTone,
  RunDockStatus,
  RunHistoryEntry,
  TopBarValidateState,
} from '#shell/index.js'
import {
  DockedFlowsControl,
  DockedRunControl,
  FlowsSidebar,
  RunDock,
  StudioFrame,
  TopBar,
} from '#shell/index.js'
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
  readonly flowFile?: string
  readonly dirty?: boolean
  readonly nodes?: readonly FlowNodeSummary[]
  readonly selectedNodeId?: string
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

export function Studio(props: StudioProps) {
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)

  const flows = props.flows ?? FIXTURE_FLOWS
  const activeFlowId = props.activeFlowId ?? flows[0]?.id ?? ''
  const nodes = props.nodes ?? FIXTURE_NODES
  const inventory = props.inventory ?? FIXTURE_INVENTORY
  const entryNodeId = props.entryNodeId ?? 'start1'
  const activeFlow = flows.find((flow) => flow.id === activeFlowId)

  return (
    <StudioFrame
      accent={props.accent}
      topBar={
        <TopBar
          flowName={activeFlow?.name ?? activeFlowId}
          flowFile={props.flowFile ?? 'flow.ts'}
          dirty={props.dirty ?? true}
          running={props.running}
          runningChip={props.runningChip}
          {...(props.validate === undefined ? {} : { validate: props.validate })}
          onValidate={props.onValidate}
          onOpenReport={props.onOpenReport}
          onSave={props.onSave}
          dockedLeft={
            leftCollapsed ? (
              <DockedFlowsControl onExpand={() => setLeftCollapsed(false)} />
            ) : undefined
          }
          // The same control in both places, and the difference is `onExpand`. Collapsed, it is
          // `Studio — panels collapsed`'s docked control and its label expands the dock; open, it
          // is `2A`'s top-bar run pill, whose label is inert and whose accent chip is the only
          // thing that acts. `2A` is why it is present at all while the dock is open.
          dockedRight={
            rightCollapsed ? (
              <DockedRunControl
                entryNodeId={entryNodeId}
                onExpand={() => setRightCollapsed(false)}
                onRun={props.onRun}
                runBlocked={props.runBlocked}
              />
            ) : undefined
          }
          runControl={
            rightCollapsed ? undefined : (
              <DockedRunControl
                entryNodeId={entryNodeId}
                onRun={props.onRun}
                runBlocked={props.runBlocked}
              />
            )
          }
        />
      }
      left={
        leftCollapsed ? undefined : (
          <FlowsSidebar
            flows={flows}
            activeFlowId={activeFlowId}
            {...(props.onSelectFlow === undefined ? {} : { onSelectFlow: props.onSelectFlow })}
            nodes={nodes}
            selectedNodeId={props.selectedNodeId ?? entryNodeId}
            inventory={inventory}
            {...(props.runs === undefined ? {} : { runs: props.runs })}
            {...(props.selectedRunId === undefined ? {} : { selectedRunId: props.selectedRunId })}
            {...(props.onSelectRun === undefined ? {} : { onSelectRun: props.onSelectRun })}
            onCollapse={() => setLeftCollapsed(true)}
          />
        )
      }
      canvas={props.canvas ?? <div data-testid="studio-canvas-slot" className={s.canvasSlot} />}
      right={
        rightCollapsed ? undefined : (
          <RunDock
            entryNodeId={entryNodeId}
            onCollapse={() => setRightCollapsed(true)}
            {...(props.runMeta === undefined ? {} : { runMeta: props.runMeta })}
            {...(props.runMetaTone === undefined ? {} : { runMetaTone: props.runMetaTone })}
            {...(props.runStatus === undefined ? {} : { runStatus: props.runStatus })}
          >
            {props.runPanel}
          </RunDock>
        )
      }
      {...(props.status === undefined ? {} : { status: props.status })}
    />
  )
}
