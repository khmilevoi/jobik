import type { CSSProperties } from 'react'
import { InsetWell } from '../primitives/index.js'
import { fontFamilies, motion, px, radii, textColors } from '../tokens.js'
import { canvasColors, canvasMetrics } from './canvasTokens.js'
import { StripePlaceholder } from './StripePlaceholder.js'
import type { NodeOutputSlotSpec } from './types.js'

export interface NodeOutputSlotProps {
  readonly slot: NodeOutputSlotSpec
  /** `canvasColors.metadata` on an ok card, `textColors.typeAnnotation` otherwise. */
  readonly captionColor: string
}

const mediaBase: CSSProperties = {
  height: px(canvasMetrics.outputSlotMediaHeight),
  borderRadius: px(radii.badge),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
}

/**
 * `### Node cards`: the optional inline output slot between the input and output sections. This
 * component owns the well and the caption row; P12 owns whatever `slot.content` renders.
 */
export function NodeOutputSlot(props: NodeOutputSlotProps) {
  const { slot } = props
  const hasCaption = slot.caption !== undefined || slot.source !== undefined

  const media =
    slot.skeleton === true ? (
      <div
        data-testid="node-output-media"
        style={{
          ...mediaBase,
          background: canvasColors.skeleton,
          backgroundSize: canvasMetrics.skeletonBackgroundSize,
          animation: motion.shimmer,
        }}
      >
        {slot.skeletonLabel === undefined ? null : (
          <div
            data-testid="node-output-skeleton-label"
            style={{
              fontFamily: fontFamilies.mono,
              fontSize: px(10),
              color: canvasColors.annotationDim,
              animation: motion.pulseSlow,
            }}
          >
            {slot.skeletonLabel}
          </div>
        )}
      </div>
    ) : slot.content === undefined ? (
      <StripePlaceholder
        data-testid="node-output-media"
        height={canvasMetrics.outputSlotMediaHeight}
        radius={radii.badge}
        label="image output"
      />
    ) : (
      <div data-testid="node-output-media" style={mediaBase}>
        {slot.content}
      </div>
    )

  return (
    <div data-testid="node-output-slot" style={{ padding: px(canvasMetrics.outputSlotGutter) }}>
      <InsetWell
        variant="output"
        data-testid="node-output-well"
        style={{
          height: px(canvasMetrics.outputSlotHeight),
          display: 'flex',
          flexDirection: 'column',
          gap: px(6),
        }}
      >
        {media}
        {hasCaption ? (
          <div
            data-testid="node-output-caption"
            style={{
              height: px(canvasMetrics.outputSlotCaptionHeight),
              display: 'flex',
              alignItems: 'center',
              gap: px(10),
              fontFamily: fontFamilies.mono,
              fontSize: px(9.5),
              color: props.captionColor,
            }}
          >
            {slot.caption}
            <div style={{ flex: 1 }} />
            {slot.source === undefined ? null : (
              <span data-testid="node-output-source" style={{ color: textColors.sectionLabel }}>
                {slot.source}
              </span>
            )}
          </div>
        ) : null}
      </InsetWell>
    </div>
  )
}
