import { cx } from '#cx.js'
import { runNodeStatusLabel } from '#run/format.js'
import { type RunDotTone, RunSpinner, RunStatusDot } from '#run/RunChrome/RunChrome.js'
import type { RunNodeStatus, RunNodeTiming } from '#run/types.js'
import s from './RunNodeList.module.css'

/**
 * `failed` and `completed` are the `Run panel — states` cards (lines 809–813, 837–841); `lastRun` is
 * the idle `Last run` block (lines 308–312). They differ only in the type step and in the two cells
 * a settled `ok` node paints.
 */
export type RunTimingsVariant = 'failed' | 'completed' | 'lastRun'

/** The four lists a node row can appear in. `rows` is the 30px list of the running state. */
export type RunNodeListVariant = 'rows' | RunTimingsVariant

/** Which of `RunChrome`'s three marks a row leads with, and with which fill. */
export type RunNodeDotSpec =
  | { readonly kind: 'spinner' }
  | { readonly kind: 'hollow' }
  | { readonly kind: 'round'; readonly tone: RunDotTone }

/** The dot a row draws, and the two class names its name and value cells take. */
export interface RunNodeTone {
  readonly dot: RunNodeDotSpec
  readonly name: string
  readonly value: string
}

/**
 * The four statuses no list variant changes, as the artboards paint them.
 *
 * Written out in full because `cssModuleUsage.test.ts` can only see literal `s.<name>` reads, and
 * `satisfies` makes a seventh status a type error rather than a row that silently renders untoned.
 */
const fixedTones = {
  running: { dot: { kind: 'spinner' }, name: s.nameRunning, value: s.valueRunning },
  queued: { dot: { kind: 'hollow' }, name: s.nameDim, value: s.valueFaint },
  skipped: { dot: { kind: 'hollow' }, name: s.nameDim, value: s.valueFaint },
  failed: {
    dot: { kind: 'round', tone: 'failed' },
    name: s.nameFailed,
    value: s.valueFailed,
  },
} satisfies Record<Exclude<RunNodeStatus, 'ok' | 'cached'>, RunNodeTone>

/** The settled name cell — the one the list variant fixes. `ok` and `cached` share it. */
const settledNames = {
  rows: s.nameSettled,
  failed: s.nameSettled,
  completed: s.nameSettled,
  lastRun: s.nameLastRun,
} satisfies Record<RunNodeListVariant, string>

/** `ok`'s value cell is the other one that moves between artboards: green on the failed card only. */
const okValues = {
  rows: s.valueSettled,
  failed: s.valueOk,
  completed: s.valueSettled,
  lastRun: s.valueSettled,
} satisfies Record<RunNodeListVariant, string>

/**
 * A node's status and the list it is in, resolved to the classes its three cells take.
 *
 * `ok` and `cached` are the two the table above leaves out, because they are the two the list
 * variant has a say in. Standing ruling 3: no run-panel artboard fixes a cached row, so the two
 * marks that keep it from reading as `ok` are read straight off the `Node states` cached card — the
 * `#4a5157` dot (design 747) and the `#79828a` status text (750), whose `cached · 0.0s` wording
 * `runNodeStatusLabel` composes. The name cell keeps the settled tone the list already gives,
 * because that is the part the design does not fix and this is not the place to invent it.
 */
export function resolveRunNodeTone(
  status: RunNodeStatus,
  variant: RunNodeListVariant,
): RunNodeTone {
  if (status === 'ok') {
    return {
      dot: { kind: 'round', tone: 'ok' },
      name: settledNames[variant],
      value: okValues[variant],
    }
  }
  if (status === 'cached') {
    return {
      dot: { kind: 'round', tone: 'cached' },
      name: settledNames[variant],
      value: s.valueCached,
    }
  }
  return fixedTones[status]
}

function RunNodeDot(props: { readonly tone: RunNodeTone; readonly nodeId: string }) {
  const { nodeId } = props
  const dot = props.tone.dot
  if (dot.kind === 'spinner') return <RunSpinner data-testid={`run-node-spinner-${nodeId}`} />
  return (
    <RunStatusDot
      data-testid={`run-node-dot-${nodeId}`}
      shape={dot.kind === 'hollow' ? 'hollow' : 'round'}
      tone={dot.kind === 'round' ? dot.tone : undefined}
    />
  )
}

export interface RunNodeRowsProps {
  readonly nodes: readonly RunNodeTiming[]
  readonly className?: string
}

/** The 30px node rows of `Studio — run in progress` (lines 607–620). */
export function RunNodeRows(props: RunNodeRowsProps) {
  return (
    <div data-testid="run-node-rows" className={cx(s.rows, props.className)}>
      {props.nodes.map((node) => {
        const tone = resolveRunNodeTone(node.status, 'rows')
        return (
          <div
            key={node.nodeId}
            data-testid={`run-node-row-${node.nodeId}`}
            className={cx(s.row, node.status === 'running' && s.rowActive)}
          >
            <RunNodeDot tone={tone} nodeId={node.nodeId} />
            <div data-testid={`run-node-name-${node.nodeId}`} className={cx(s.rowName, tone.name)}>
              {node.nodeId}
            </div>
            <div className={s.spacer} />
            <div
              data-testid={`run-node-value-${node.nodeId}`}
              className={cx(s.rowValue, tone.value)}
            >
              {runNodeStatusLabel(node)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** The three compact lists, spelled out; `satisfies` makes a fourth variant a type error. */
const timingsSizes = {
  failed: s.timingsCompact,
  completed: s.timingsCompact,
  lastRun: s.timingsLastRun,
} satisfies Record<RunTimingsVariant, string>

export interface RunNodeTimingsProps {
  readonly nodes: readonly RunNodeTiming[]
  readonly variant: RunTimingsVariant
  readonly className?: string
}

export function RunNodeTimings(props: RunNodeTimingsProps) {
  return (
    <div
      data-testid="run-timings"
      className={cx(s.timings, timingsSizes[props.variant], props.className)}
    >
      {props.nodes.map((node) => {
        const tone = resolveRunNodeTone(node.status, props.variant)
        return (
          <div key={node.nodeId} className={s.timingRow}>
            <span data-testid={`run-timing-name-${node.nodeId}`} className={tone.name}>
              {node.nodeId}
            </span>
            <span data-testid={`run-timing-value-${node.nodeId}`} className={tone.value}>
              {runNodeStatusLabel(node)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
