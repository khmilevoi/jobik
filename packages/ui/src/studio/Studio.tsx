import { type ReactNode, useState } from 'react'
import type { FlowNodeSummary, FlowSummary, InventoryEntry } from '../shell/index.js'
import {
  DockedFlowsControl,
  DockedRunControl,
  FlowsSidebar,
  RunDock,
  StudioFrame,
  TopBar,
} from '../shell/index.js'

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
  readonly running?: boolean
  /** The slot the running chip occupies. No plan owns the chip's markup yet. */
  readonly runningChip?: ReactNode
  readonly onValidate?: () => void
  readonly onSave?: () => void
  readonly onRun?: () => void
}

export function Studio(props: StudioProps) {
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)

  const flows = props.flows ?? FIXTURE_FLOWS
  const activeFlowId = props.activeFlowId ?? 'publication'
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
          onValidate={props.onValidate}
          onSave={props.onSave}
          dockedLeft={
            leftCollapsed ? (
              <DockedFlowsControl onExpand={() => setLeftCollapsed(false)} />
            ) : undefined
          }
          dockedRight={
            rightCollapsed ? (
              <DockedRunControl
                entryNodeId={entryNodeId}
                onExpand={() => setRightCollapsed(false)}
                onRun={props.onRun}
              />
            ) : undefined
          }
        />
      }
      left={
        leftCollapsed ? undefined : (
          <FlowsSidebar
            flows={flows}
            activeFlowId={activeFlowId}
            nodes={nodes}
            selectedNodeId={props.selectedNodeId ?? entryNodeId}
            inventory={inventory}
            onCollapse={() => setLeftCollapsed(true)}
          />
        )
      }
      canvas={
        props.canvas ?? <div data-testid="studio-canvas-slot" style={{ flex: 1, minWidth: 0 }} />
      }
      right={
        rightCollapsed ? undefined : (
          <RunDock entryNodeId={entryNodeId} onCollapse={() => setRightCollapsed(true)}>
            {props.runPanel}
          </RunDock>
        )
      }
    />
  )
}
