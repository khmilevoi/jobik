import { cx } from '#cx.js'
import { SectionLabel } from '#primitives/index.js'
import { PanelHeader } from '#shell/PanelHeader/PanelHeader.js'
import type { KindDotTone } from '#tokens.js'
import { textColors } from '#tokens.js'
import s from './FlowsSidebar.module.css'

export interface FlowSummary {
  readonly id: string
  readonly name: string
  readonly nodeCount: number
}

export interface FlowNodeSummary {
  readonly id: string
  readonly kind: string
  /** `start` paints the dot with the accent. Independent of selection. */
  readonly dot: KindDotTone
}

export interface InventoryEntry {
  readonly name: string
  readonly kind: string
}

export interface FlowsSidebarProps {
  readonly flows: readonly FlowSummary[]
  readonly activeFlowId: string
  readonly nodes: readonly FlowNodeSummary[]
  readonly selectedNodeId?: string
  /** The flow's node definitions. Read-only reference in v1 — nodes cannot be added from it. */
  readonly inventory: readonly InventoryEntry[]
  readonly onCollapse: () => void
}

/** Spelled out, not indexed by a computed key — see `cssModuleUsage.test.ts`. */
const dotTone = {
  start: s.dotStart,
  neutral: s.dotNeutral,
  queued: s.dotQueued,
  cached: s.dotCached,
} satisfies Record<KindDotTone, string>

export function FlowsSidebar(props: FlowsSidebarProps) {
  const activeFlow = props.flows.find((flow) => flow.id === props.activeFlowId)
  return (
    <div data-testid="studio-sidebar" className={s.sidebar}>
      <PanelHeader
        chevron="left"
        collapseLabel="Collapse flows and nodes"
        onCollapse={props.onCollapse}
      >
        <SectionLabel color={textColors.panelHeaderLabel}>Flows &amp; nodes</SectionLabel>
      </PanelHeader>

      <div data-testid="studio-sidebar-scroll" className={s.scroll}>
        <SectionLabel className={s.groupLabelFirst}>Flows</SectionLabel>
        <div className={s.list}>
          {props.flows.map((flow) => {
            const active = flow.id === props.activeFlowId
            return (
              <div
                key={flow.id}
                data-testid={`studio-flow-row-${flow.id}`}
                className={cx(s.row, s.flowRow, active && s.flowRowActive)}
              >
                <div className={cx(s.flowName, active && s.flowNameActive)}>{flow.name}</div>
                <div className={cx(s.flowCount, active && s.flowCountActive)}>{flow.nodeCount}</div>
              </div>
            )
          })}
        </div>

        <SectionLabel className={s.groupLabel}>
          Nodes in {activeFlow?.name ?? props.activeFlowId}
        </SectionLabel>
        <div className={s.list}>
          {props.nodes.map((node) => {
            const selected = node.id === props.selectedNodeId
            return (
              <div
                key={node.id}
                data-testid={`studio-node-row-${node.id}`}
                className={cx(s.row, s.nodeRow, selected && s.nodeRowSelected)}
              >
                <div
                  data-testid={`studio-node-dot-${node.id}`}
                  className={cx(s.nodeDot, dotTone[node.dot])}
                />
                <div className={cx(s.nodeId, selected && s.nodeIdSelected)}>{node.id}</div>
                <div className={s.nodeSpacer} />
                <div className={cx(s.nodeKind, selected && s.nodeKindSelected)}>{node.kind}</div>
              </div>
            )
          })}
        </div>

        <SectionLabel className={s.groupLabel}>Inventory</SectionLabel>
        <div className={s.list}>
          {props.inventory.map((entry) => (
            <div
              key={entry.name}
              data-testid={`studio-inventory-row-${entry.name}`}
              className={cx(s.row, s.inventoryRow)}
            >
              <div className={s.inventoryName}>{entry.name}</div>
              <div data-testid={`studio-inventory-kind-${entry.name}`} className={s.inventoryKind}>
                {entry.kind}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
