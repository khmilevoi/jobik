import { ImageFrame } from '#output/ImageFrame/ImageFrame.js'
import s from './PrimaryImage.module.css'

export interface OutputMetadataRowProps {
  /** `['1024×1024', 'png', '412 kb']`. Joined with the artboard's dimmer `·`. */
  readonly parts: readonly string[]
  /** Right-aligned, e.g. `sRGB`. */
  readonly trailing?: string
}

/** design 903–907 — the mono metadata row under the primary image. */
export function OutputMetadataRow(props: OutputMetadataRowProps) {
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
}

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
}

/** design 897–907 — the Preview body's 336px left column. */
export function PrimaryImage(props: PrimaryImageProps) {
  const badge = (
    <div data-testid="output-primary-badge" className={s.badge}>
      {props.index} / {props.total}
    </div>
  )

  return (
    <div data-testid="output-primary" className={s.primary}>
      <ImageFrame
        variant="primary"
        src={props.src}
        label={props.label}
        overlay={badge}
        data-testid="output-primary-frame"
      />
      {props.meta === undefined ? null : (
        <OutputMetadataRow parts={props.meta} trailing={props.metaTrailing} />
      )}
    </div>
  )
}
