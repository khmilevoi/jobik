import type { ReactNode } from 'react'
import { StripePlaceholder } from '#canvas/index.js'
import { cx } from '#cx.js'
import { outputMetrics } from '#output/outputTokens.js'
import s from './ImageFrame.module.css'

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

/**
 * The two cells, spelled out. `satisfies` makes a missing or invented cell a type error, and every
 * value is a literal `s.<name>` read `cssModuleUsage.test.ts` can verify.
 */
const frameClass = {
  primary: s.primary,
  variant: s.variant,
} satisfies Record<ImageFrameVariant, string>

const labelClass = {
  primary: s.labelPrimary,
  variant: s.labelVariant,
} satisfies Record<ImageFrameVariant, string>

/** `StripePlaceholder`'s own SVG layout still needs the frame's real pixel height. */
const placeholderHeight = {
  primary: outputMetrics.primaryImageHeight,
  variant: outputMetrics.variantHeight,
} satisfies Record<ImageFrameVariant, number>

/**
 * The bordered media box. `StripePlaceholder` fills it whenever there is no URL — which is both the
 * artboard's own state and the real state before P14 resolves an `AssetDescriptor`. Its stripe is
 * laid out at the frame's full height, so the 1px border eats its last row; `overflow: hidden`
 * clips it.
 */
export function ImageFrame(props: ImageFrameProps) {
  return (
    <div data-testid={props['data-testid']} className={cx(s.frame, frameClass[props.variant])}>
      {props.src === undefined ? (
        <>
          <StripePlaceholder height={placeholderHeight[props.variant]} radius={0} />
          <div data-testid="image-frame-label" className={cx(s.label, labelClass[props.variant])}>
            {props.label}
          </div>
        </>
      ) : (
        <img alt={props.label} src={props.src} className={s.image} />
      )}
      {props.overlay}
    </div>
  )
}
