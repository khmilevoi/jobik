import { canvasMetrics } from '#canvas/canvasTokens.js'
import { StripePlaceholder } from '#canvas/StripePlaceholder/StripePlaceholder.js'
import type { NodeOutputSlotSpec } from '#canvas/types.js'
import { cx, type StyleWithVars } from '#cx.js'
import { InsetWell } from '#primitives/index.js'
import { radii } from '#tokens.js'
import s from './NodeOutputSlot.module.css'

export interface NodeOutputSlotProps {
  readonly slot: NodeOutputSlotSpec
  /** `textColors.metadata` on an ok card, `textColors.typeAnnotation` otherwise. */
  readonly captionColor: string
}

/**
 * `### Node cards`: the optional inline output slot between the input and output sections. This
 * component owns the well and the caption row; P12 owns whatever `slot.content` renders.
 */
export function NodeOutputSlot(props: NodeOutputSlotProps) {
  const { slot } = props
  const hasCaption = slot.caption !== undefined || slot.source !== undefined
  // The caller's colour is a value the stylesheet cannot know, so it rides in as the custom
  // property the caption rule already reads.
  const captionStyle: StyleWithVars = { '--jbk-node-caption-color': props.captionColor }

  const media =
    slot.skeleton === true ? (
      <div data-testid="node-output-media" className={cx(s.media, s.skeleton)}>
        {slot.skeletonLabel === undefined ? null : (
          <div data-testid="node-output-skeleton-label" className={s.skeletonLabel}>
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
      <div data-testid="node-output-media" className={s.media}>
        {slot.content}
      </div>
    )

  return (
    <div data-testid="node-output-slot" className={s.slot}>
      <InsetWell variant="output" data-testid="node-output-well" className={s.well}>
        {media}
        {hasCaption ? (
          <div data-testid="node-output-caption" className={s.caption} style={captionStyle}>
            {slot.caption}
            <div className={s.spacer} />
            {slot.source === undefined ? null : (
              <span data-testid="node-output-source" className={s.source}>
                {slot.source}
              </span>
            )}
          </div>
        ) : null}
      </InsetWell>
    </div>
  )
}
