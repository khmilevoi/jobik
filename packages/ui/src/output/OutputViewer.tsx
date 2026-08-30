import type { AssetDescriptor } from '@jobik/core'
import { type CSSProperties, useState } from 'react'
import { Button } from '../primitives/index.js'
import {
  accent,
  borders,
  fontFamilies,
  fontWeights,
  px,
  radii,
  surfaces,
  textColors,
} from '../tokens.js'
import type { FlowUiDescriptor, OutputValues } from './flowUi.js'
import { formatBytes } from './format.js'
import { resolveOutputComponent } from './GenericOutput.js'
import { LogLines, type OutputLogLine } from './LogLines.js'
import { outputMetrics } from './outputTokens.js'
import { RawJson } from './RawJson.js'

export type OutputViewerTab = 'preview' | 'raw' | 'logs'

const TABS: readonly { readonly id: OutputViewerTab; readonly label: string }[] = [
  { id: 'preview', label: 'Preview' },
  { id: 'raw', label: 'Raw' },
  { id: 'logs', label: 'Logs' },
]

export interface OutputViewerProps {
  /** The node whose output fills `Preview`. */
  readonly nodeId: string
  readonly output: OutputValues
  /** The flow's registered UI extension. Absent — or unregistered — falls back to JSON. */
  readonly descriptor?: FlowUiDescriptor
  /** P14 supplies the real resolver. The default knows no URLs, which is the artboard's state. */
  readonly assetUrl?: (descriptor: AssetDescriptor) => string | undefined
  /** `render.image · Buffer[3]`. Shown on `Preview` only. */
  readonly source?: string
  /** What `Raw` serialises. Defaults to `output`; P14 passes the whole run report. */
  readonly raw?: unknown
  readonly logs?: readonly OutputLogLine[]
  readonly defaultTab?: OutputViewerTab
  readonly onTabChange?: (tab: OutputViewerTab) => void
  readonly onCopyAll?: () => void
  readonly onDownload?: () => void
  /** Layout only — width and height. Never a colour. */
  readonly style?: CSSProperties
}

const monoMeta: CSSProperties = {
  fontFamily: fontFamilies.mono,
  fontSize: px(10),
  color: textColors.typeAnnotation,
}

function noUrl(): undefined {
  return undefined
}

/** design 880–977 — the whole `Output viewer` panel. */
export function OutputViewer(props: OutputViewerProps) {
  const [tab, setTab] = useState<OutputViewerTab>(props.defaultTab ?? 'preview')
  const raw = props.raw === undefined ? props.output : props.raw
  const logs = props.logs ?? []
  const Output = resolveOutputComponent(props.descriptor, props.nodeId)

  const select = (next: OutputViewerTab): void => {
    setTab(next)
    props.onTabChange?.(next)
  }

  const meta =
    tab === 'raw'
      ? `json · ${formatBytes(new TextEncoder().encode(JSON.stringify(raw) ?? '').length)}`
      : tab === 'logs'
        ? `${logs.length} ${logs.length === 1 ? 'line' : 'lines'}`
        : undefined

  return (
    <div
      data-testid="output-viewer"
      style={{
        background: surfaces.panel,
        border: `1px solid ${borders.frame}`,
        borderRadius: px(radii.panel),
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: fontFamilies.ui,
        ...props.style,
      }}
    >
      <div
        data-testid="output-viewer-header"
        style={{
          height: px(outputMetrics.headerHeight),
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: px(outputMetrics.headerGap),
          padding: `0 ${px(outputMetrics.headerPaddingX)}`,
          borderBottom: `1px solid ${borders.panelHeaderDivider}`,
          background: surfaces.topBar,
        }}
      >
        <div
          role="tablist"
          style={{ display: 'flex', alignItems: 'center', gap: px(outputMetrics.tabGap) }}
        >
          {TABS.map((entry) => {
            const active = entry.id === tab
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => select(entry.id)}
                style={{
                  border: 'none',
                  background: 'none',
                  padding: active ? '0 2px 2px' : 0,
                  fontFamily: fontFamilies.ui,
                  fontSize: px(12),
                  fontWeight: active ? fontWeights.semibold : fontWeights.regular,
                  color: active ? textColors.primary : textColors.muted,
                  borderBottom: active
                    ? `${outputMetrics.tabUnderlineWidth}px solid ${accent.cssVar}`
                    : undefined,
                }}
              >
                {entry.label}
              </button>
            )
          })}
        </div>

        {tab === 'preview' && props.source !== undefined ? (
          <>
            <div
              data-testid="output-viewer-divider"
              style={{
                width: '1px',
                height: px(outputMetrics.headerDividerHeight),
                background: borders.inset,
              }}
            />
            <div data-testid="output-viewer-source" style={monoMeta}>
              {props.source}
            </div>
          </>
        ) : null}

        <div style={{ flex: 1 }} />

        {meta === undefined ? null : (
          <div data-testid="output-viewer-meta" style={monoMeta}>
            {meta}
          </div>
        )}

        {props.onCopyAll === undefined && props.onDownload === undefined ? null : (
          <div style={{ display: 'flex', alignItems: 'center', gap: px(8) }}>
            {props.onCopyAll === undefined ? null : (
              <Button variant="quiet" size="md" onClick={props.onCopyAll}>
                Copy all
              </Button>
            )}
            {props.onDownload === undefined ? null : (
              <Button variant="outlined" size="md" onClick={props.onDownload}>
                Download
              </Button>
            )}
          </div>
        )}
      </div>

      <div role="tabpanel" data-testid="output-viewer-panel">
        {tab === 'preview' ? (
          <Output
            nodeId={props.nodeId}
            output={props.output}
            surface="viewer"
            assetUrl={props.assetUrl ?? noUrl}
          />
        ) : null}
        {tab === 'raw' ? <RawJson value={raw} /> : null}
        {tab === 'logs' ? <LogLines lines={logs} /> : null}
      </div>
    </div>
  )
}
