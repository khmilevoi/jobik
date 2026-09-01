import { reatomComponent } from '@reatom/react'
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

/**
 * The 6×6 square dot on a node row carries the node's **run state**, not its selection
 * (`02-shell.md` §3.5): the accent while it is the running/active one, `#6f9c82` once it succeeded,
 * `#3d4348` while idle. `2A` shows all three settled nodes on `#6f9c82` with `render` selected;
 * `Studio — default` shows only `start1` accented. So `ok` widens `KindDotTone`, which has no step
 * for a node that has already run.
 */
export type SidebarNodeDotTone = KindDotTone | 'ok'

export interface FlowNodeSummary {
  readonly id: string
  readonly kind: string
  /** The row's own tone, chosen by the caller. Independent of selection. */
  readonly dot: SidebarNodeDotTone
}

export interface InventoryEntry {
  readonly name: string
  readonly kind: string
}

/**
 * A row of `2A`'s `Run history` section: `#221 2.4s`, `#220 failed`, `#219 2.4s`.
 *
 * A failed run replaces its duration with the word `failed`; a run whose duration is not known
 * shows nothing rather than a synthesised number.
 */
export interface RunHistoryEntry {
  readonly id: string
  /** `#221` — already `#`-prefixed, exactly as the design writes it. */
  readonly label: string
  readonly status: 'ok' | 'failed'
  /** e.g. `2.4s`. */
  readonly elapsed?: string
}

export interface FlowsSidebarProps {
  readonly flows: readonly FlowSummary[]
  readonly activeFlowId: string
  /**
   * Points the Studio at the flow a row names. Optional exactly as `onSelectRun` is: the rows are
   * buttons either way, and a sidebar mounted without this one is the read-only listing every
   * artboard draws.
   */
  readonly onSelectFlow?: (flowId: string) => void
  /**
   * `3E` note 04 — *"Blocked switching is `3b`'s rule, not a new state: the list drops to 45% and
   * answers nothing."* The drop sits on the 248px list container rather than on a row
   * (`flow-switching.dc.html:59`), and it covers the `Flows` list alone: nothing else in the panel
   * is what the user is blocked from. `4A`'s coverage grid adds that it is instant — *"a disabled
   * list should never look like it is thinking"* — so there is no transition on this opacity.
   */
  readonly blocked?: boolean
  readonly nodes: readonly FlowNodeSummary[]
  readonly selectedNodeId?: string
  /**
   * Points the run panel at another of the flow's declared starts — the same move a click on a
   * start card on the canvas makes. Reachable only from the `Start` section, which itself only
   * draws once the flow declares more than one start; see that section's own comment.
   */
  readonly onSelectStart?: (nodeId: string) => void
  /** The flow's node definitions. Read-only reference in v1 — nodes cannot be added from it. */
  readonly inventory: readonly InventoryEntry[]
  /**
   * `2A`'s third section. It stands **in place of** `Inventory`, not below it: `2A` draws
   * `Run history` exactly where `Studio — default` draws `Inventory`, with the rest of the panel
   * empty beneath it, and `2A` is the newer artboard. Leave it empty and the sidebar is
   * `Studio — default`.
   */
  readonly runs?: readonly RunHistoryEntry[]
  readonly selectedRunId?: string
  readonly onSelectRun?: (runId: string) => void
  readonly onCollapse: () => void
}

/** Spelled out, not indexed by a computed key — see `cssModuleUsage.test.ts`. */
const dotTone = {
  start: s.dotStart,
  neutral: s.dotNeutral,
  queued: s.dotQueued,
  cached: s.dotCached,
  ok: s.dotOk,
} satisfies Record<SidebarNodeDotTone, string>

/**
 * A `reatomComponent` with an unchanged prop API. `flows`, `nodes`, `inventory` and `runs` all have
 * a model home, but they reach this component through `Studio`, which ships artboard fixtures as
 * its defaults precisely so the shell can be rendered standalone with no model and no provider.
 * Reading `FlowsModel` here would make that impossible for the sake of a re-render `Studio`'s own
 * `useMemo` already bounds.
 */
export const FlowsSidebar = reatomComponent(function FlowsSidebar(props: FlowsSidebarProps) {
  const activeFlow = props.flows.find((flow) => flow.id === props.activeFlowId)
  const runs = props.runs ?? []
  const onSelectRun = props.onSelectRun
  const onSelectFlow = props.onSelectFlow
  const onSelectStart = props.onSelectStart
  const startNodes = props.nodes.filter((node) => node.kind === 'start')
  const blocked = props.blocked === true

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
        <div data-testid="studio-flow-list" className={cx(s.list, blocked && s.listBlocked)}>
          {props.flows.map((flow) => {
            const active = flow.id === props.activeFlowId
            return (
              <button
                key={flow.id}
                type="button"
                data-testid={`studio-flow-row-${flow.id}`}
                disabled={blocked}
                onClick={
                  blocked || onSelectFlow === undefined ? undefined : () => onSelectFlow(flow.id)
                }
                className={cx(s.row, s.flowRow, active && s.flowRowActive)}
              >
                <div className={cx(s.flowName, active && s.flowNameActive)}>{flow.name}</div>
                <div className={cx(s.flowCount, active && s.flowCountActive)}>{flow.nodeCount}</div>
              </button>
            )
          })}
        </div>

        {/*
          The flow's declared starts, ahead of the full node list — clicking one moves the run
          panel's entry point, exactly as clicking a start card on the canvas does. Drawn only
          past the first: a single-start flow already names its one start in the row below, and
          every artboard shows exactly that flow, so this section would draw a single redundant
          row for every flow the design was checked against.
        */}
        {startNodes.length <= 1 ? null : (
          <>
            <SectionLabel className={s.groupLabel}>Start</SectionLabel>
            <div className={s.list}>
              {startNodes.map((node) => {
                const selected = node.id === props.selectedNodeId
                return (
                  <button
                    key={node.id}
                    type="button"
                    data-testid={`studio-start-row-${node.id}`}
                    onClick={onSelectStart === undefined ? undefined : () => onSelectStart(node.id)}
                    className={cx(s.row, s.startRow, selected && s.startRowSelected)}
                  >
                    <div className={cx(s.nodeDot, s.dotStart)} />
                    <div className={cx(s.startRowId, selected && s.startRowIdSelected)}>
                      {node.id}
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}

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

        {runs.length === 0 ? (
          <>
            <SectionLabel className={s.groupLabel}>Inventory</SectionLabel>
            <div className={s.list}>
              {props.inventory.map((entry) => (
                <div
                  key={entry.name}
                  data-testid={`studio-inventory-row-${entry.name}`}
                  className={cx(s.row, s.inventoryRow)}
                >
                  <div className={s.inventoryName}>{entry.name}</div>
                  <div
                    data-testid={`studio-inventory-kind-${entry.name}`}
                    className={s.inventoryKind}
                  >
                    {entry.kind}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <SectionLabel className={s.groupLabel}>Run history</SectionLabel>
            <div className={s.list}>
              {runs.map((run) => {
                const selected = run.id === props.selectedRunId
                const failed = run.status === 'failed'
                // `failed` replaces the duration; a run with neither shows no meta at all rather
                // than a number the wire never carried.
                const meta = failed ? 'failed' : run.elapsed
                return (
                  <button
                    key={run.id}
                    type="button"
                    data-testid={`studio-run-row-${run.id}`}
                    onClick={onSelectRun === undefined ? undefined : () => onSelectRun(run.id)}
                    className={cx(s.row, s.runRow, selected && s.runRowSelected)}
                  >
                    <div className={cx(s.runLabel, selected && s.runLabelSelected)}>
                      {run.label}
                    </div>
                    <div className={s.runSpacer} />
                    {meta === undefined ? null : (
                      <div
                        data-testid={`studio-run-meta-${run.id}`}
                        className={cx(
                          s.runMeta,
                          failed ? s.runMetaFailed : selected ? s.runMetaCurrent : s.runMetaPast,
                        )}
                      >
                        {meta}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}, 'FlowsSidebar')
