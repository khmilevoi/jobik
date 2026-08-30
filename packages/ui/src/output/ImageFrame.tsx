import type { CSSProperties, ReactNode } from 'react'
import { canvasColors } from '../canvas/canvasTokens.js'
import { StripePlaceholder } from '../canvas/StripePlaceholder.js'
import { borders, fontFamilies, px, radii, surfaces, textColors, tracking } from '../tokens.js'
import { outputMetrics } from './outputTokens.js'

/** Only the two cells the `Output viewer` artboard contains are typed. */
export type ImageFrameVariant = 'primary' | 'variant'

export interface ImageFrameProps {
  readonly variant: ImageFrameVariant
  /** The resolved asset URL. Absent — the artboard's own state — shows the striped placeholder. */
  readonly src?: string
  /** `cover.png`. The `alt` when there is a `src`, the centred mono label when there is not. */
  readonly label: string
  /** Painted over the media, e.g. the `n / m` badge. */
  readonly overlay?: ReactNode
  readonly 'data-testid'?: string
}

interface Cell {
  readonly height: number
  readonly radius: number
  readonly border: string
  readonly label: CSSProperties
}

const centred: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: fontFamilies.mono,
}

const cells: Record<ImageFrameVariant, Cell> = {
  // design 898–900
  primary: {
    height: outputMetrics.primaryImageHeight,
    radius: outputMetrics.primaryImageRadius,
    border: `1px solid ${borders.control}`,
    label: {
      ...centred,
      fontSize: px(10),
      letterSpacing: tracking.startTag,
      color: canvasColors.slotCaption,
    },
  },
  // design 913–915
  variant: {
    height: outputMetrics.variantHeight,
    radius: radii.control,
    border: `1px solid ${borders.inset}`,
    label: { ...centred, fontSize: px(9.5), color: textColors.sectionLabel },
  },
}

/**
 * The bordered media box. `StripePlaceholder` fills it whenever there is no URL — which is both the
 * artboard's own state and the real state before P14 resolves an `AssetDescriptor`. Its stripe is
 * laid out at the frame's full height, so the 1px border eats its last row; `overflow: hidden`
 * clips it.
 */
export function ImageFrame(props: ImageFrameProps) {
  const cell = cells[props.variant]
  return (
    <div
      data-testid={props['data-testid']}
      style={{
        position: 'relative',
        boxSizing: 'border-box',
        height: px(cell.height),
        border: cell.border,
        borderRadius: px(cell.radius),
        overflow: 'hidden',
        background: surfaces.imagePlaceholder,
      }}
    >
      {props.src === undefined ? (
        <>
          <StripePlaceholder height={cell.height} radius={0} />
          <div data-testid="image-frame-label" style={cell.label}>
            {props.label}
          </div>
        </>
      ) : (
        <img
          alt={props.label}
          src={props.src}
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
      {props.overlay}
    </div>
  )
}
