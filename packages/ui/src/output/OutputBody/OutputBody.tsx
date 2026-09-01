import type { AssetDescriptor } from '@jobik/core'
import { reatomComponent } from '@reatom/react'
import { cx } from '#cx.js'
import type { FlowUiDescriptor, OutputSurface, OutputValues } from '#output/flowUi.js'
import { resolveOutputComponent } from '#output/GenericOutput/GenericOutput.js'
import { LogLines, type OutputLogLine } from '#output/LogLines/LogLines.js'
import { RawJson } from '#output/RawJson/RawJson.js'
import type { OutputViewerTab } from '#output/tabs.js'
import s from './OutputBody.module.css'

export interface OutputBodyProps {
  /** The node whose output fills `Preview`. */
  readonly nodeId: string
  readonly output: OutputValues
  /** The flow's registered UI extension. Absent — or unregistered — falls back to JSON. */
  readonly descriptor?: FlowUiDescriptor
  readonly assetUrl?: (descriptor: AssetDescriptor) => string | undefined
  /** What `Raw` serialises. */
  readonly raw: unknown
  readonly logs: readonly OutputLogLine[]
  readonly tab: OutputViewerTab
  /**
   * Which surface the flow-local component is being rendered on. The card passes `viewer`, the
   * `2A` dock passes `dock`; both reach the component as `props.surface`.
   */
  readonly surface: OutputSurface
  /** Layout only — the dock makes the panel fill and scroll. Never a colour. */
  readonly className?: string
}

function noUrl(): undefined {
  return undefined
}

/**
 * The tab panel under the header: the flow-local `Preview`, the `Raw` JSON block, or the log lines.
 *
 * The card and the dock render the same three bodies from the same data, so this is one component
 * rather than the same switch written twice. It paints nothing of its own beyond the swap — the
 * caller's `className` carries the rest, because only the dock needs the panel to fill.
 *
 * ## The `key` is load-bearing
 *
 * `4A` (design 119-126) cross-fades the panel on `jfade 90ms linear` while the tab marker travels
 * over 140ms above it. `jfade` is a one-shot entrance, so it plays only on a mount: without
 * `key={props.tab}` React reuses this element across a tab change, the animation has already run,
 * and nothing fades — silently, with the stylesheet still looking correct. The key is what makes
 * each tab's body its own element.
 */
export const OutputBody = reatomComponent(function OutputBody(props: OutputBodyProps) {
  const Output = resolveOutputComponent(props.descriptor, props.nodeId)
  return (
    <div
      key={props.tab}
      role="tabpanel"
      data-testid="output-viewer-panel"
      className={cx(s.panel, props.className)}
    >
      {props.tab === 'preview' ? (
        <Output
          nodeId={props.nodeId}
          output={props.output}
          surface={props.surface}
          assetUrl={props.assetUrl ?? noUrl}
        />
      ) : null}
      {props.tab === 'raw' ? <RawJson value={props.raw} /> : null}
      {props.tab === 'logs' ? <LogLines lines={props.logs} /> : null}
    </div>
  )
}, 'OutputBody')
