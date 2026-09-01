import type { AssetDescriptor } from '@jobik/core'
import { reatomFactoryComponent, useWrap } from '@reatom/react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { cx, type StyleWithVars } from '#cx.js'
import { reatomDockState } from '#output/dockState.js'
import type { FlowUiDescriptor, OutputValues } from '#output/flowUi.js'
import { outputHeaderMeta } from '#output/headerMeta.js'
import type { OutputLogLine } from '#output/LogLines/LogLines.js'
import { OutputBody } from '#output/OutputBody/OutputBody.js'
import { OutputHeader } from '#output/OutputHeader/OutputHeader.js'
import { outputMetrics } from '#output/outputTokens.js'
import type { OutputViewerTab } from '#output/tabs.js'
import { Button, ChevronUpIcon, CloseIcon, IconButton, SectionLabel } from '#primitives/index.js'
import { px } from '#tokens.js'
import s from './OutputDock.module.css'

export interface OutputDockProps {
  /**
   * `10-output-dock.md` §4 — the `outputOpen` canvas prop, whose default is `true`. `false` draws
   * the 34px collapsed strip instead of the 378px dock.
   */
  readonly open?: boolean
  /** The node whose output fills `Preview`. */
  readonly nodeId: string
  readonly output: OutputValues
  /** The flow's registered UI extension. Absent — or unregistered — falls back to JSON. */
  readonly descriptor?: FlowUiDescriptor
  readonly assetUrl?: (descriptor: AssetDescriptor) => string | undefined
  /**
   * The header's mono context line — `render.image · Buffer[3] · run #221`. One field longer than
   * the standalone card's, which omits the run number. Shown on `Preview` only.
   */
  readonly context?: string
  /**
   * The collapsed strip's mono summary — `render.image · 3 files · run #221`. It reports the file
   * count where the open header reports the type.
   */
  readonly summary?: string
  /** What `Raw` serialises. Defaults to `output`. */
  readonly raw?: unknown
  readonly logs?: readonly OutputLogLine[]
  /** Controlled tab. Omit to let the dock keep its own, starting at `defaultTab`. */
  readonly tab?: OutputViewerTab
  readonly defaultTab?: OutputViewerTab
  readonly onTabChange?: (tab: OutputViewerTab) => void
  /** The `×` and `esc`. Both are wired only when this is supplied. */
  readonly onClose?: () => void
  /** `Show output` on the collapsed strip. */
  readonly onOpen?: () => void
  /** The design draws exactly one height, 378px, and that is the default. */
  readonly defaultHeight?: number
  /** Fires while the resize handle is dragged, with the dock's new height in pixels. */
  readonly onHeightChange?: (height: number) => void
  /** Layout only — never a colour. */
  readonly className?: string
}

/**
 * Artboard `2A` — the output dock along the bottom of the canvas column.
 *
 * It **displaces**, it does not overlay: `10-output-dock.md` §1 puts it as the last child of the
 * centre column, `flex:none` beside a `flex:1` canvas, so opening it shrinks the canvas by exactly
 * its own height and covers nothing. There is no backdrop and no shadow. Mounting it is the
 * shell's job; this component is the surface.
 *
 * **The dock's height eases; artboard `4A` (design 128-141) is why.** It supersedes
 * `01-foundations.md` §6.7's "Output dock open / close — Nothing": height carries the change over
 * 180ms on the settle curve while the contents cross the last 120ms of it, and the canvas above
 * simply gives up the space. The rule is in the stylesheet; a drag suppresses it, because a
 * dragged height belongs to the pointer.
 *
 * **Both halves are here now.** `StudioApp` keeps this mounted for as long as the viewer names a
 * node and drives `open` off `output.collapsed`, so the height has a from-value on a real collapse
 * and the 34px strip is reachable. The strip is a `<section>` rather than a `<div>` for exactly
 * that reason and no other: React reconciles a host element by TYPE, so a `<div>` here would
 * replace the `<section>` above and the browser would have a new box to lay out rather than a
 * height to ease — the transition would be declared, mounted, and dead. Same tag, same position,
 * one element, one 180ms.
 *
 * ## What moved, and what did not
 *
 * `reatomFactoryComponent` builds one {@link reatomDockState} per mounted dock and aborts it on
 * unmount, which is what lets the tab, the height and the drag be units rather than `useState`:
 * two docks are two heights, and neither outlives the element that asked for it. The two window
 * listener groups went with them, each owned by a `withConnectHook` that returns its own cleanup
 * (RTM-A06, RTM-L01) and each installed only while this render reads the atom that owns it.
 *
 * The dock's **data** is still props. Every value the `2A` artboard draws does have a home on
 * `OutputModel` — `StudioApp` reads all of them there and hands them over — but `open`, `onOpen`,
 * `defaultHeight` and the controlled `tab` do not, and a surface that read half its state and took
 * the other half would be harder to follow than one that takes all of it. The two action buttons
 * are the exception, and they are not props any more: `OutputHeader` reads `3A`'s cells off the
 * model itself, because a button's state is the sequence's, not the surface's.
 */
export const OutputDock = reatomFactoryComponent(function OutputDock(
  initProps: OutputDockProps,
  options: { name: string },
) {
  /**
   * The props the last render drew with.
   *
   * The two listener groups outlive any one render and must call the handlers the *current* props
   * name, so they read them through here rather than closing over `initProps`. Assigning it below
   * is not a state write: nothing renders it, and every reader of it is a DOM event that has
   * already happened.
   */
  let latest = initProps

  const dock = reatomDockState(
    {
      initialTab: initProps.defaultTab ?? 'preview',
      initialHeight: initProps.defaultHeight ?? outputMetrics.dockHeight,
      onClose: () => latest.onClose?.(),
      onHeightChange: (height) => latest.onHeightChange?.(height),
    },
    options.name,
  )

  return (props: OutputDockProps) => {
    latest = props

    const open = props.open ?? true
    const { onClose } = props

    // RTM-C02: both handlers are invoked from a DOM event, which runs outside the frame this render
    // is in. `useWrap` puts them back inside it; `dock.tab.set` at the call site is what RTM-S01
    // asks for instead of a `selectTab` action that would only forward the value.
    const startResize = useWrap((event: ReactPointerEvent<HTMLDivElement>) => {
      dock.startResize(event.clientY)
    })
    const selectTab = useWrap((next: OutputViewerTab) => {
      dock.tab.set(next)
      props.onTabChange?.(next)
    })

    // RTM-C01: the collapsed strip reads none of the dock's own state, so nothing above this guard
    // may read it either. A dock drawn as a 34px strip installs no listener and holds no height.
    if (!open) {
      return (
        <section
          aria-label="Output"
          data-testid="output-dock-strip"
          className={cx(s.strip, props.className)}
        >
          <SectionLabel>Output</SectionLabel>
          {props.summary === undefined ? null : (
            <div data-testid="output-dock-summary" className={s.summary}>
              {props.summary}
            </div>
          )}
          <div className={s.spacer} />
          {/*
            `10-output-dock.md` §3: `height:22px;padding:0 9px;gap:7px` — the design's only h22
            button, and `Button`'s `quiet:xs` cell. The chevron trails the label, so it rides in
            through `trailing` and inherits the button's colour through the hover swap.
          */}
          {props.onOpen === undefined ? null : (
            <Button
              variant="quiet"
              size="xs"
              trailing={<ChevronUpIcon />}
              onClick={props.onOpen}
              data-testid="output-dock-show"
              aria-label="Show output"
            >
              Show output
            </Button>
          )}
        </section>
      )
    }

    // Reading these is what installs their listeners: the trio exists while a pointer is down, and
    // the `keydown` listener while there is something for `esc` to close.
    const dragging = dock.dragging()
    if (dragging) dock.tracking()
    if (onClose !== undefined) dock.escBound()

    const tab = props.tab ?? dock.tab()
    const raw = props.raw === undefined ? props.output : props.raw
    const logs = props.logs ?? []
    const meta = outputHeaderMeta(tab, raw, logs)

    // The dragged height is a value no stylesheet can know, so it rides in as the custom property
    // the rule already reads — the one inline style the package permits.
    const style: StyleWithVars = { '--jbk-output-dock-current-height': px(dock.height()) }

    // `10-output-dock.md` §2.2 — a second 1 × 16 rule, the mono `esc` hint, then the close button.
    const trailing =
      onClose === undefined ? undefined : (
        <>
          <div className={s.divider} />
          <div className={s.dismiss}>
            <div data-testid="output-dock-esc" className={s.escHint}>
              esc
            </div>
            {/*
              `3A`'s `Icon only · 26 × 26` shape, not a padded toolbar button: a `quiet:md` cell is
              26px tall but ~30px wide from its `0 10px` padding, so the × sat in a rectangle where
              the design draws a square.
            */}
            <IconButton
              size={26}
              icon={<CloseIcon />}
              label="Close output"
              onClick={onClose}
              data-testid="output-dock-close"
            />
          </div>
        </>
      )

    return (
      <section
        aria-label="Output"
        data-testid="output-dock"
        className={cx(s.dock, dragging && s.dockDragging, props.className)}
        style={style}
      >
        {/* The design's only resize affordance: a bare 7px strip. It fixes no keyboard equivalent
            anywhere in the file, and no min or max height. */}
        <div data-testid="output-dock-handle" className={s.handle} onPointerDown={startResize}>
          <div className={s.grip} />
        </div>

        <OutputHeader
          variant="dock"
          tab={tab}
          onTabChange={selectTab}
          {...(tab === 'preview' && props.context !== undefined ? { context: props.context } : {})}
          {...(meta === undefined ? {} : { meta })}
          copyAll
          download
          {...(trailing === undefined ? {} : { trailing })}
        />

        <OutputBody
          nodeId={props.nodeId}
          output={props.output}
          {...(props.descriptor === undefined ? {} : { descriptor: props.descriptor })}
          {...(props.assetUrl === undefined ? {} : { assetUrl: props.assetUrl })}
          raw={raw}
          logs={logs}
          tab={tab}
          surface="dock"
          className={s.body}
        />
      </section>
    )
  }
}, 'OutputDock')
