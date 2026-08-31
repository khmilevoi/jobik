import type { AssetDescriptor } from '@jobik/core'
import { type PointerEvent as ReactPointerEvent, useEffect, useState } from 'react'
import { cx, type StyleWithVars } from '#cx.js'
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
  readonly onCopyAll?: () => void
  readonly onDownload?: () => void
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
 * The dock cannot be dragged shorter than the chrome it always draws. This is a physical floor,
 * not a design value: `10-output-dock.md` §2.1 states "No minimum or maximum height".
 */
const MIN_HEIGHT = outputMetrics.dockHandleHeight + outputMetrics.headerHeight

interface Drag {
  readonly startY: number
  readonly startHeight: number
}

/**
 * Artboard `2A` — the output dock along the bottom of the canvas column.
 *
 * It **displaces**, it does not overlay: `10-output-dock.md` §1 puts it as the last child of the
 * centre column, `flex:none` beside a `flex:1` canvas, so opening it shrinks the canvas by exactly
 * its own height and covers nothing. There is no backdrop and no shadow. Mounting it is the
 * shell's job; this component is the surface.
 *
 * **Nothing here animates.** `01-foundations.md` §6.4 records zero `transition` declarations in the
 * whole design file and §6.7 names this dock's open/close among the things it deliberately fixes
 * no motion for — the 378px dock and the 34px strip are two branches, not two ends of a slide.
 */
export function OutputDock(props: OutputDockProps) {
  const open = props.open ?? true
  const { onClose } = props
  const [ownTab, setOwnTab] = useState<OutputViewerTab>(props.defaultTab ?? 'preview')
  const [height, setHeight] = useState<number>(props.defaultHeight ?? outputMetrics.dockHeight)
  const [drag, setDrag] = useState<Drag | null>(null)

  const tab = props.tab ?? ownTab
  const raw = props.raw === undefined ? props.output : props.raw
  const logs = props.logs ?? []
  const meta = outputHeaderMeta(tab, raw, logs)

  // `10-output-dock.md` §4 — "a `window` `keydown` listener … closes the dock globally, from
  // anywhere in the app". It is the dock's own behaviour, so it is bound here and not in the shell.
  useEffect(() => {
    if (!open || onClose === undefined) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    globalThis.window.addEventListener('keydown', onKeyDown)
    return () => globalThis.window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const { onHeightChange } = props
  useEffect(() => {
    if (drag === null) return
    const onMove = (event: PointerEvent): void => {
      const next = Math.max(MIN_HEIGHT, drag.startHeight - (event.clientY - drag.startY))
      setHeight(next)
      onHeightChange?.(next)
    }
    const onUp = (): void => setDrag(null)
    globalThis.window.addEventListener('pointermove', onMove)
    globalThis.window.addEventListener('pointerup', onUp)
    globalThis.window.addEventListener('pointercancel', onUp)
    return () => {
      globalThis.window.removeEventListener('pointermove', onMove)
      globalThis.window.removeEventListener('pointerup', onUp)
      globalThis.window.removeEventListener('pointercancel', onUp)
    }
  }, [drag, onHeightChange])

  const selectTab = (next: OutputViewerTab): void => {
    setOwnTab(next)
    props.onTabChange?.(next)
  }

  const startResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    setDrag({ startY: event.clientY, startHeight: height })
  }

  if (!open) {
    return (
      <div data-testid="output-dock-strip" className={cx(s.strip, props.className)}>
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
      </div>
    )
  }

  // The dragged height is a value no stylesheet can know, so it rides in as the custom property
  // the rule already reads — the one inline style the package permits.
  const style: StyleWithVars = { '--jbk-output-dock-current-height': px(height) }

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
      className={cx(s.dock, props.className)}
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
        {...(props.onCopyAll === undefined ? {} : { onCopyAll: props.onCopyAll })}
        {...(props.onDownload === undefined ? {} : { onDownload: props.onDownload })}
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
