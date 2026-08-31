import { ImageFrame } from '#output/ImageFrame/ImageFrame.js'
import s from './VariantRow.module.css'

export interface VariantSpec {
  readonly src?: string
  /** `og.png` — the `alt`, and the placeholder label while there is no URL. */
  readonly label: string
  /** The whole mono line under the tile, e.g. `1200×630 · 208 kb`. */
  readonly caption?: string
}

export interface VariantRowProps {
  readonly variants: readonly VariantSpec[]
  /**
   * Trailing dashed `no variant configured` tiles. The artboard shows one; a flow that configured
   * none shows one too, which is what the dashed tile is for. Default `0`.
   */
  readonly emptyVariants?: number
}

/** design 911–931 — the row of secondary variants beside the primary image. */
export function VariantRow(props: VariantRowProps) {
  const empties = Array.from({ length: props.emptyVariants ?? 0 }, (_, index) => index)
  return (
    <div data-testid="output-variant-row" className={s.row}>
      {props.variants.map((variant, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: variants have no stable identity of their own
        <div key={`${index}-${variant.label}`} data-testid="output-variant" className={s.column}>
          <ImageFrame variant="variant" src={variant.src} label={variant.label} />
          {variant.caption === undefined ? null : (
            <div data-testid="output-variant-caption" className={s.caption}>
              {variant.caption}
            </div>
          )}
        </div>
      ))}
      {empties.map((index) => (
        <div key={`empty-${index}`} className={s.column}>
          <div data-testid="output-variant-empty" className={s.emptyTile}>
            <div data-testid="output-variant-empty-label" className={s.emptyLabel}>
              no variant
              <br />
              configured
            </div>
          </div>
          <div data-testid="output-variant-empty-caption" className={s.emptyCaption}>
            optional
          </div>
        </div>
      ))}
    </div>
  )
}
