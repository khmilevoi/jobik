import { accent, fontFamilies, px, radii, statusColors, textColors } from '../tokens.js'
import { runNodeStatusLabel } from './format.js'
import { RunSpinner, RunStatusDot } from './RunChrome.js'
import { runPanelColors, runPanelMetrics } from './runPanelTokens.js'
import type { RunNodeStatus, RunNodeTiming } from './types.js'

type StatusTone = {
  /** `round` with `dotColor`, `hollow`, or the running row's spinner. */
  readonly dot: 'round' | 'hollow' | 'spinner'
  readonly dotColor?: string
  readonly name: string
  readonly value: string
}

/**
 * Four of the five statuses as the artboards paint them. `ok` is the one whose right-hand cell
 * changes between artboards, so its two colours are supplied per list instead of fixed here.
 */
const statusTones: Record<Exclude<RunNodeStatus, 'ok'>, StatusTone> = {
  running: { dot: 'spinner', name: textColors.activeIdentifier, value: accent.cssVar },
  queued: { dot: 'hollow', name: runPanelColors.queuedNodeName, value: textColors.faintest },
  failed: {
    dot: 'round',
    dotColor: statusColors.failed,
    name: statusColors.errorTag,
    value: statusColors.failed,
  },
  skipped: { dot: 'hollow', name: runPanelColors.queuedNodeName, value: textColors.faintest },
}

function toneOf(status: RunNodeStatus, okName: string, okValue: string): StatusTone {
  if (status === 'ok') {
    return { dot: 'round', dotColor: statusColors.ok, name: okName, value: okValue }
  }
  return statusTones[status]
}

export interface RunNodeRowsProps {
  readonly nodes: readonly RunNodeTiming[]
}

/**
 * The 30px node rows of `Studio — run in progress` (lines 607–620). Only the running row carries a
 * border; `STUDIO_GLOBAL_CSS` sets `box-sizing: border-box` under `[data-jobik-studio]`, so every
 * row stays 30px tall either way.
 */
export function RunNodeRows(props: RunNodeRowsProps) {
  return (
    <div
      data-testid="run-node-rows"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: px(runPanelMetrics.nodeRowGap),
      }}
    >
      {props.nodes.map((node) => {
        const tone = toneOf(node.status, textColors.fieldLabel, textColors.sectionLabel)
        const active = node.status === 'running'
        return (
          <div
            key={node.nodeId}
            data-testid={`run-node-row-${node.nodeId}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: px(9),
              height: px(runPanelMetrics.nodeRowHeight),
              padding: `0 ${px(runPanelMetrics.nodeRowPaddingX)}`,
              borderRadius: px(radii.control),
              ...(active
                ? {
                    background: accent.headerWash,
                    border: `1px solid ${runPanelColors.activeRowBorder}`,
                  }
                : {}),
            }}
          >
            {tone.dot === 'spinner' ? (
              <RunSpinner data-testid={`run-node-spinner-${node.nodeId}`} />
            ) : (
              <RunStatusDot
                data-testid={`run-node-dot-${node.nodeId}`}
                shape={tone.dot}
                color={tone.dotColor}
              />
            )}
            <div
              data-testid={`run-node-name-${node.nodeId}`}
              style={{ fontFamily: fontFamilies.mono, fontSize: px(11.5), color: tone.name }}
            >
              {node.nodeId}
            </div>
            <div style={{ flex: 1 }} />
            <div
              data-testid={`run-node-value-${node.nodeId}`}
              style={{ fontFamily: fontFamilies.mono, fontSize: px(10), color: tone.value }}
            >
              {runNodeStatusLabel(node)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * `failed` and `completed` are the `Run panel — states` cards (lines 809–813, 837–841); `lastRun` is
 * the idle `Last run` block (lines 308–312). They differ only in the type step and in the two cells
 * a settled `ok` node paints.
 */
export type RunTimingsVariant = 'failed' | 'completed' | 'lastRun'

const timingsVariants: Record<
  RunTimingsVariant,
  { readonly fontSize: number; readonly okName: string; readonly okValue: string }
> = {
  failed: { fontSize: 10.5, okName: textColors.fieldLabel, okValue: statusColors.ok },
  completed: { fontSize: 10.5, okName: textColors.fieldLabel, okValue: textColors.sectionLabel },
  lastRun: {
    fontSize: 10,
    okName: runPanelColors.lastRunNodeName,
    okValue: textColors.sectionLabel,
  },
}

export interface RunNodeTimingsProps {
  readonly nodes: readonly RunNodeTiming[]
  readonly variant: RunTimingsVariant
}

export function RunNodeTimings(props: RunNodeTimingsProps) {
  const variant = timingsVariants[props.variant]
  return (
    <div
      data-testid="run-timings"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: px(runPanelMetrics.timingRowGap),
        fontFamily: fontFamilies.mono,
        fontSize: px(variant.fontSize),
      }}
    >
      {props.nodes.map((node) => {
        const tone = toneOf(node.status, variant.okName, variant.okValue)
        return (
          <div key={node.nodeId} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span data-testid={`run-timing-name-${node.nodeId}`} style={{ color: tone.name }}>
              {node.nodeId}
            </span>
            <span data-testid={`run-timing-value-${node.nodeId}`} style={{ color: tone.value }}>
              {runNodeStatusLabel(node)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
