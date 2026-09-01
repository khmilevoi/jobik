import type { AssetDescriptor } from '@jobik/core'
import { atom } from '@reatom/core'
import { reatomFactoryComponent, useWrap } from '@reatom/react'
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
  /**
   * Whether the card draws `3A`'s two action buttons. The sequences behind them belong to
   * `model/output.ts` — see `OutputHeader` — so these say only whether the button exists, which is
   * what the artboard's own instances differ on: the `Preview` card draws both, the `Raw` card
   * neither.
   */
  readonly copyAll?: boolean
  readonly download?: boolean
  /** Layout only — width and height. Never a colour. */
  readonly className?: string
}

/**
 * design 880–977 — the whole standalone `Output viewer` card.
 *
 * The tab is this card's own, and stays that way: which pane you are looking at is a fact about one
 * rendered surface, not about the flow or the run, and `model/types.ts` has no home for it. What
 * changes is that it is a unit rather than `useState` — `reatomFactoryComponent` builds one per
 * mounted card and aborts it on unmount, so two cards are two tabs and neither outlives its element.
 *
 * Its header reads `OutputActionsModel`, so this card only mounts under a `StudioModelProvider`.
 */
export const OutputViewer = reatomFactoryComponent(function OutputViewer(
  initProps: OutputViewerProps,
  options: { name: string },
) {
  const tab = atom<OutputViewerTab>(initProps.defaultTab ?? 'preview', `${options.name}.tab`)

  return (props: OutputViewerProps) => {
    // RTM-C02: the click runs outside the frame this render is in. `tab.set` at the call site is
    // what RTM-S01 asks for instead of an action that would only forward the value.
    const select = useWrap((next: OutputViewerTab) => {
      tab.set(next)
      props.onTabChange?.(next)
    })

    const current = tab()
    const raw = props.raw === undefined ? props.output : props.raw
    const logs = props.logs ?? []
    const meta = outputHeaderMeta(current, raw, logs)

    return (
      <div data-testid="output-viewer" className={cx(s.viewer, props.className)}>
        <OutputHeader
          variant="card"
          tab={current}
          onTabChange={select}
          {...(current === 'preview' && props.source !== undefined
            ? { context: props.source }
            : {})}
          {...(meta === undefined ? {} : { meta })}
          {...(props.copyAll === undefined ? {} : { copyAll: props.copyAll })}
          {...(props.download === undefined ? {} : { download: props.download })}
        />
        <OutputBody
          nodeId={props.nodeId}
          output={props.output}
          {...(props.descriptor === undefined ? {} : { descriptor: props.descriptor })}
          {...(props.assetUrl === undefined ? {} : { assetUrl: props.assetUrl })}
          raw={raw}
          logs={logs}
          tab={current}
          surface="viewer"
        />
      </div>
    )
  }
}, 'OutputViewer')
