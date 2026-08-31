import type { AssetDescriptor } from '@jobik/core'
import { useState } from 'react'
import { cx } from '#cx.js'
import type { FlowUiDescriptor, OutputValues } from '#output/flowUi.js'
import { outputHeaderMeta } from '#output/headerMeta.js'
import type { OutputLogLine } from '#output/LogLines/LogLines.js'
import { OutputBody } from '#output/OutputBody/OutputBody.js'
import { OutputHeader } from '#output/OutputHeader/OutputHeader.js'
import type { OutputViewerTab } from '#output/tabs.js'
import s from './OutputViewer.module.css'

export type { OutputViewerTab } from '#output/tabs.js'

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
}

/** design 880–977 — the whole standalone `Output viewer` card. */
export function OutputViewer(props: OutputViewerProps) {
  const [tab, setTab] = useState<OutputViewerTab>(props.defaultTab ?? 'preview')
  const raw = props.raw === undefined ? props.output : props.raw
  const logs = props.logs ?? []

  const meta = outputHeaderMeta(tab, raw, logs)

  const select = (next: OutputViewerTab): void => {
    setTab(next)
    props.onTabChange?.(next)
  }

  return (
    <div data-testid="output-viewer" className={cx(s.viewer, props.className)}>
      <OutputHeader
        variant="card"
        tab={tab}
        onTabChange={select}
        {...(tab === 'preview' && props.source !== undefined ? { context: props.source } : {})}
        {...(meta === undefined ? {} : { meta })}
        {...(props.onCopyAll === undefined ? {} : { onCopyAll: props.onCopyAll })}
        {...(props.onDownload === undefined ? {} : { onDownload: props.onDownload })}
      />
      <OutputBody
        nodeId={props.nodeId}
        output={props.output}
        {...(props.descriptor === undefined ? {} : { descriptor: props.descriptor })}
        {...(props.assetUrl === undefined ? {} : { assetUrl: props.assetUrl })}
        raw={raw}
        logs={logs}
        tab={tab}
        surface="viewer"
      />
    </div>
  )
}
