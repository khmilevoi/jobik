import { reatomComponent, useAction } from '@reatom/react'
import type { ReactNode } from 'react'
import { cx } from '#cx.js'
import { useStudioModel } from '#model/context.js'
import { OUTPUT_TABS, type OutputViewerTab } from '#output/tabs.js'
import {
  Button,
  CopyIcon,
  type CopyState,
  DownloadIcon,
  type DownloadState,
} from '#primitives/index.js'
import s from './OutputHeader.module.css'

/**
 * Which surface the header belongs to.
 *
 * `06-output-viewer.md` §4 lists every difference between the standalone card and the `2A` dock.
 * Inside the header there is exactly one: the padding. The card pads `0 14px`; the dock pads
 * `0 12px 0 14px`, so its 26px close button sits 12px from the edge while the tabs still start at
 * 14px. Everything else — the 40px height, the 16px gap, the tab treatment, the divider, the
 * context line and the two action buttons — is identical, which is why both surfaces render this
 * one component instead of two headers that would drift.
 */
export type OutputHeaderVariant = 'card' | 'dock'

export interface OutputHeaderProps {
  readonly variant: OutputHeaderVariant
  readonly tab: OutputViewerTab
  readonly onTabChange: (tab: OutputViewerTab) => void
  /**
   * The mono context line after the 1×16 rule — `render.image · Buffer[3]` on the card,
   * `render.image · Buffer[3] · run #221` in the dock. Absent hides the rule with it.
   */
  readonly context?: string
  /** The right-aligned mono readout the `Raw` card shows instead of a context line. */
  readonly meta?: string
  /**
   * Whether this surface draws `3A`'s `Copy all` at all — which is the only part of it a caller
   * still decides. `2A` draws it and the design's `Raw` card instance draws neither button, so the
   * presence stays a prop while the sequence behind it does not: `OutputModel.copyState` is
   * the cell and `OutputModel.copyAll` is the press, both on the model, because what a copy does
   * is serialise the run report and that belongs where the report is.
   */
  readonly copyAll?: boolean
  /**
   * Whether this surface draws `Download`. It reports no percentage because nothing on the wire
   * carries a byte count, so the button stays on `3A` rule 03's indeterminate branch: spinner,
   * then `Saved`.
   */
  readonly download?: boolean
  /** The dock's dismiss group — the second rule, the `esc` hint and the close button. */
  readonly trailing?: ReactNode
}

/** The two paddings, spelled out so a missing case is a type error. */
const variantClass = {
  card: s.headerCard,
  dock: s.headerDock,
} satisfies Record<OutputHeaderVariant, string>

/** `3A` §2.1, verbatim — the copy toolbar button's label in each of its four cells. */
const COPY_LABELS = {
  idle: 'Copy all',
  busy: 'Copying',
  ok: 'Copied',
  failed: 'Copy failed',
} satisfies Record<CopyState, string>

/**
 * `3A` §3.1, verbatim. `progress` is unreachable here and stays for exhaustiveness: the label only
 * appears beside a percentage, and no percentage exists — see `download`.
 */
const DOWNLOAD_LABELS = {
  idle: 'Download',
  busy: 'Preparing',
  progress: 'Downloading',
  ok: 'Saved',
} satisfies Record<DownloadState, string>

/**
 * The 40px tab bar both output surfaces wear — `06-output-viewer.md` §1.1, `10-output-dock.md` §2.2.
 *
 * The design fixes **no** transition on any part of it: `01-foundations.md` §6.4 records zero
 * `transition` declarations in the whole file, and §6.7 names the tab underline explicitly. So the
 * 1.5px accent `border-bottom` simply moves to whichever tab is active, and the inactive-to-active
 * colour change is instant.
 *
 * ## The two buttons read the model, and that is the whole of this wave's change here
 *
 * `3A`'s copy and download matrices used to run inside this component, through
 * `useCopyAction`/`useDownloadAction` — two `setTimeout` machines whose lifetime was a React
 * unmount. They are now `model/output.ts`'s `copyState`/`downloadState` and `copyAll`/`download`,
 * each hold `await wrap(sleep(ms))` inside an action extended with `withAbort()` (RTM-A05), which
 * is what lets a flow switch cancel a hold that would otherwise return a button to idle inside a
 * flow that never pressed it. This header draws the cell and sends the press.
 *
 * Reading the model makes this component — and so both output surfaces — require a
 * `StudioModelProvider` above it. That is deliberate: a `Copy all` whose sequence ran locally
 * could report `Copied` for a clipboard write that never happened, because the payload it copies
 * is the run report and only the model has one.
 */
export const OutputHeader = reatomComponent(function OutputHeader(props: OutputHeaderProps) {
  const { output } = useStudioModel()

  // RTM-C02: both presses come from a DOM event, outside the frame this render is in.
  const copyAll = useAction(output.copyAll)
  const download = useAction(output.download)

  // RTM-C01: each cell is read only on the branch that draws its button, so a surface that wires
  // neither action subscribes to neither sequence.
  const copyCell = props.copyAll === true ? output.copyState() : undefined
  const downloadCell = props.download === true ? output.downloadState() : undefined
  const hasActions = copyCell !== undefined || downloadCell !== undefined

  return (
    <div data-testid="output-viewer-header" className={cx(s.header, variantClass[props.variant])}>
      <div role="tablist" className={s.tablist}>
        {OUTPUT_TABS.map((entry) => {
          const active = entry.id === props.tab
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => props.onTabChange(entry.id)}
              className={cx(s.tab, active && s.tabActive)}
            >
              {entry.label}
            </button>
          )
        })}
      </div>

      {props.context === undefined ? null : (
        <>
          <div data-testid="output-viewer-divider" className={s.divider} />
          <div data-testid="output-viewer-source" className={s.monoMeta}>
            {props.context}
          </div>
        </>
      )}

      <div className={s.spacer} />

      {props.meta === undefined ? null : (
        <div data-testid="output-viewer-meta" className={s.monoMeta}>
          {props.meta}
        </div>
      )}

      {hasActions || props.trailing !== undefined ? (
        <div className={s.actions}>
          {/*
            `3A` rule 02 — each button reserves the width of its longest label (`106` for copy,
            `112` for download), so `Copy all` → `Copied` → `Copy failed` never shifts the row.
          */}
          {copyCell === undefined ? null : (
            <Button
              variant="quiet"
              size="md"
              state={copyCell}
              icon={<CopyIcon />}
              reserveWidth={106}
              onClick={copyAll}
              data-testid="output-copy-all"
            >
              {COPY_LABELS[copyCell]}
            </Button>
          )}
          {downloadCell === undefined ? null : (
            <Button
              variant="outlined"
              size="md"
              state={downloadCell}
              icon={<DownloadIcon />}
              reserveWidth={112}
              onClick={download}
              data-testid="output-download"
            >
              {DOWNLOAD_LABELS[downloadCell]}
            </Button>
          )}
          {props.trailing}
        </div>
      ) : null}
    </div>
  )
}, 'OutputHeader')
