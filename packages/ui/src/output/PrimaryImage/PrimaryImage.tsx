import { reatomComponent } from '@reatom/react'
import type { OutputSurface } from '#output/flowUi.js'
import { ImageFrame, type ImageFrameVariant } from '#output/ImageFrame/ImageFrame.js'
import s from './PrimaryImage.module.css'

export interface OutputMetadataRowProps {
  /** `['1024×1024', 'png', '412 kb']`. Joined with the artboard's dimmer `·`. */
  readonly parts: readonly string[]
  /** Right-aligned, e.g. `sRGB`. */
  readonly trailing?: string
}

/** design 903–907 — the mono metadata row under the primary image. */
export const OutputMetadataRow = reatomComponent(function OutputMetadataRow(
  props: OutputMetadataRowProps,
) {
  return (
    <div data-testid="output-metadata-row" className={s.metadataRow}>
      {props.parts.map((part, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: parts are stable and unique
        <span key={`${index}-${part}`} className={s.metadataPart}>
          {index === 0 ? null : (
            <span data-testid="output-metadata-separator" className={s.metadataSeparator}>
              ·
            </span>
          )}
          <span>{part}</span>
        </span>
      ))}
      <div className={s.metadataSpacer} />
      {props.trailing === undefined ? null : (
        <span data-testid="output-metadata-trailing" className={s.metadataTrailing}>
          {props.trailing}
        </span>
      )}
    </div>
  )
}, 'OutputMetadataRow')

/** The primary image's own data. `OutputPreview` supplies the badge counters. */
export interface OutputPrimarySpec {
  readonly src?: string
  /** `cover.png` — the `alt`, and the placeholder label while there is no URL. */
  readonly label: string
  readonly meta?: readonly string[]
  readonly metaTrailing?: string
}

export interface PrimaryImageProps extends OutputPrimarySpec {
  /** `1` in `1 / 3`. */
  readonly index: number
  /** `3` in `1 / 3` — every image the run produced, the primary included. */
  readonly total: number
  /**
   * Which surface the column sits on. `06-output-viewer.md` §4: the standalone card fixes it at
   * `336 × 236`; the `2A` dock widens it to `372` and lets the frame grow. Default `viewer`.
   */
  readonly surface?: OutputSurface
}

/** The two column widths — `06-output-viewer.md` §1.3 and `10-output-dock.md` §2.3. */
const columnClass = {
  card: s.primary,
  viewer: s.primary,
  dock: s.primaryDock,
} satisfies Record<OutputSurface, string>

/** The dock's frame grows with the dock; the card's is fixed at 236px. */
const frameVariant = {
  card: 'primary',
  viewer: 'primary',
  dock: 'primaryFill',
} satisfies Record<OutputSurface, ImageFrameVariant>

/** design 897–907 — the Preview body's left column. */
export const PrimaryImage = reatomComponent(function PrimaryImage(props: PrimaryImageProps) {
  const surface = props.surface ?? 'viewer'
  const badge = (
    <div data-testid="output-primary-badge" className={s.badge}>
      {props.index} / {props.total}
    </div>
  )

  return (
    <div data-testid="output-primary" className={columnClass[surface]}>
      <ImageFrame
        variant={frameVariant[surface]}
        {...(props.src === undefined ? {} : { src: props.src })}
        label={props.label}
        overlay={badge}
        data-testid="output-primary-frame"
      />
      {props.meta === undefined ? null : (
        <OutputMetadataRow
          parts={props.meta}
          {...(props.metaTrailing === undefined ? {} : { trailing: props.metaTrailing })}
        />
      )}
    </div>
  )
}, 'PrimaryImage')
