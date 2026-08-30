import type { CSSProperties } from 'react'
import { SectionLabel } from '../primitives/index.js'
import type { KindDotTone } from '../tokens.js'
import {
  borders,
  fontFamilies,
  fontWeights,
  kindDotColors,
  layout,
  px,
  radii,
  surfaces,
  textColors,
} from '../tokens.js'
import { PanelHeader } from './PanelHeader.js'

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

const listStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: px(1),
  padding: '0 8px',
}

const rowBase: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  height: px(layout.listRowHeight),
  padding: '0 8px',
  borderRadius: px(radii.control),
}

function groupLabelStyle(first: boolean): CSSProperties {
  return { padding: first ? '14px 10px 6px 14px' : '20px 10px 6px 14px' }
}

export function FlowsSidebar(props: FlowsSidebarProps) {
  const activeFlow = props.flows.find((flow) => flow.id === props.activeFlowId)
  return (
    <div
      data-testid="studio-sidebar"
      style={{
        width: px(layout.leftSidebarWidth),
        flex: 'none',
        display: 'flex',
        flexDirection: 'column',
        background: surfaces.panel,
        borderRight: `1px solid ${borders.shellDivider}`,
      }}
    >
      <PanelHeader
        chevron="left"
        collapseLabel="Collapse flows and nodes"
        onCollapse={props.onCollapse}
      >
        <SectionLabel color={textColors.panelHeaderLabel}>Flows &amp; nodes</SectionLabel>
      </PanelHeader>

      <div data-testid="studio-sidebar-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <SectionLabel style={groupLabelStyle(true)}>Flows</SectionLabel>
        <div style={listStyle}>
          {props.flows.map((flow) => {
            const active = flow.id === props.activeFlowId
            return (
              <div
                key={flow.id}
                data-testid={`studio-flow-row-${flow.id}`}
                style={{
                  ...rowBase,
                  justifyContent: 'space-between',
                  ...(active
                    ? {
                        background: surfaces.activeListRow,
                        border: `1px solid ${borders.activeListRow}`,
                      }
                    : {}),
                }}
              >
                <div
                  style={{
                    fontSize: px(12.5),
                    color: active ? textColors.primary : textColors.inactiveListItem,
                    ...(active ? { fontWeight: fontWeights.medium } : {}),
                  }}
                >
                  {flow.name}
                </div>
                <div
                  style={{
                    fontFamily: fontFamilies.mono,
                    fontSize: px(9.5),
                    color: active ? textColors.activeMeta : textColors.sectionLabel,
                  }}
                >
                  {flow.nodeCount}
                </div>
              </div>
            )
          })}
        </div>

        <SectionLabel style={groupLabelStyle(false)}>
          Nodes in {activeFlow?.name ?? props.activeFlowId}
        </SectionLabel>
        <div style={listStyle}>
          {props.nodes.map((node) => {
            const selected = node.id === props.selectedNodeId
            return (
              <div
                key={node.id}
                data-testid={`studio-node-row-${node.id}`}
                style={{
                  ...rowBase,
                  gap: px(9),
                  ...(selected ? { background: surfaces.activeNodeRow } : {}),
                }}
              >
                <div
                  data-testid={`studio-node-dot-${node.id}`}
                  style={{
                    width: px(6),
                    height: px(6),
                    borderRadius: px(radii.kindDot),
                    background: kindDotColors[node.dot],
                  }}
                />
                <div
                  style={{
                    fontFamily: fontFamilies.mono,
                    fontSize: px(11.5),
                    color: selected ? textColors.activeIdentifier : textColors.fieldLabel,
                  }}
                >
                  {node.id}
                </div>
                <div style={{ flex: 1 }} />
                <div
                  style={{
                    fontFamily: fontFamilies.mono,
                    fontSize: px(9.5),
                    color: selected ? textColors.activeMeta : textColors.sectionLabel,
                  }}
                >
                  {node.kind}
                </div>
              </div>
            )
          })}
        </div>

        <SectionLabel style={groupLabelStyle(false)}>Inventory</SectionLabel>
        <div style={listStyle}>
          {props.inventory.map((entry) => (
            <div
              key={entry.name}
              data-testid={`studio-inventory-row-${entry.name}`}
              style={{
                ...rowBase,
                height: px(layout.inventoryRowHeight),
                justifyContent: 'space-between',
              }}
            >
              <div
                style={{
                  fontFamily: fontFamilies.mono,
                  fontSize: px(11.5),
                  color: textColors.inactiveListItem,
                }}
              >
                {entry.name}
              </div>
              <div
                data-testid={`studio-inventory-kind-${entry.name}`}
                style={{ fontSize: px(11), color: textColors.sectionLabel }}
              >
                {entry.kind}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
