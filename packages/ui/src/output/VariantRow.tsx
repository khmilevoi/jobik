import type { CSSProperties } from 'react'
import { borders, fontFamilies, px, radii, surfaces, textColors } from '../tokens.js'
import { ImageFrame } from './ImageFrame.js'
import { outputColors, outputMetrics } from './outputTokens.js'

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

const column: CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column' }

const caption: CSSProperties = {
  fontFamily: fontFamilies.mono,
  fontSize: px(9.5),
  color: textColors.typeAnnotation,
}

/** design 911–931 — the row of secondary variants beside the primary image. */
export function VariantRow(props: VariantRowProps) {
  const empties = Array.from({ length: props.emptyVariants ?? 0 }, (_, index) => index)
  return (
    <div
      data-testid="output-variant-row"
      style={{ display: 'flex', gap: px(outputMetrics.variantGap) }}
    >
      {props.variants.map((variant) => (
        <div
          key={variant.label}
          data-testid="output-variant"
          style={{ ...column, gap: px(outputMetrics.variantCaptionGap) }}
        >
          <ImageFrame variant="variant" src={variant.src} label={variant.label} />
          {variant.caption === undefined ? null : (
            <div data-testid="output-variant-caption" style={caption}>
              {variant.caption}
            </div>
          )}
        </div>
      ))}
      {empties.map((index) => (
        <div key={`empty-${index}`} style={{ ...column, gap: px(outputMetrics.variantCaptionGap) }}>
          <div
            data-testid="output-variant-empty"
            style={{
              boxSizing: 'border-box',
              height: px(outputMetrics.variantHeight),
              border: `1px dashed ${borders.dashed}`,
              borderRadius: px(radii.control),
              background: surfaces.topBar,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              data-testid="output-variant-empty-label"
              style={{
                fontFamily: fontFamilies.mono,
                fontSize: px(9.5),
                color: outputColors.emptyVariantLabel,
                textAlign: 'center',
                lineHeight: outputMetrics.emptyVariantLineHeight,
              }}
            >
              no variant
              <br />
              configured
            </div>
          </div>
          <div
            data-testid="output-variant-empty-caption"
            style={{ ...caption, color: textColors.faintest }}
          >
            optional
          </div>
        </div>
      ))}
    </div>
  )
}
