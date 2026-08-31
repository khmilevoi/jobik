import type { AssetDescriptor } from '@jobik/core'
import { type CSSProperties, useState } from 'react'
import { cx } from '../../cx.js'
import { Button } from '../../primitives/index.js'
import type { FlowUiDescriptor, OutputValues } from '../flowUi.js'
import { formatBytes } from '../format.js'
import { resolveOutputComponent } from '../GenericOutput/GenericOutput.js'
import { LogLines, type OutputLogLine } from '../LogLines/LogLines.js'
import { RawJson } from '../RawJson/RawJson.js'
import s from './OutputViewer.module.css'

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
  readonly className?: string
  /**
   * @deprecated Layout only, kept for `StudioApp`'s inline width/height override until that
   * directory migrates its own call site to `className`. Merges last onto the root element.
   */
  readonly style?: CSSProperties
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
    <div data-testid="output-viewer" className={cx(s.viewer, props.className)} style={props.style}>
      <div data-testid="output-viewer-header" className={s.header}>
        <div role="tablist" className={s.tablist}>
          {TABS.map((entry) => {
            const active = entry.id === tab
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => select(entry.id)}
                className={cx(s.tab, active && s.tabActive)}
              >
                {entry.label}
              </button>
            )
          })}
        </div>

        {tab === 'preview' && props.source !== undefined ? (
          <>
            <div data-testid="output-viewer-divider" className={s.divider} />
            <div data-testid="output-viewer-source" className={s.monoMeta}>
              {props.source}
            </div>
          </>
        ) : null}

        <div className={s.spacer} />

        {meta === undefined ? null : (
          <div data-testid="output-viewer-meta" className={s.monoMeta}>
            {meta}
          </div>
        )}

        {props.onCopyAll === undefined && props.onDownload === undefined ? null : (
          <div className={s.actions}>
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
