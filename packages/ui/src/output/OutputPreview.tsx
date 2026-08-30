import { SectionLabel } from '../primitives/index.js'
import { borders, px } from '../tokens.js'
import { outputMetrics } from './outputTokens.js'
import { type OutputPrimarySpec, PrimaryImage } from './PrimaryImage.js'
import type { TypedValue } from './TypedValueGrid.js'
import { TypedValueGrid } from './TypedValueGrid.js'
import { VariantRow, type VariantSpec } from './VariantRow.js'

export interface OutputPreviewProps {
  readonly primary: OutputPrimarySpec
  readonly variants?: readonly VariantSpec[]
  /** Trailing dashed `no variant configured` tiles. The artboard shows one. */
  readonly emptyVariants?: number
  readonly typedValues?: readonly TypedValue[]
}

/**
 * design 896–950 — the whole Preview body.
 *
 * Jobik owns the viewer chrome; a flow-local output component owns this body. Exporting it keeps a
 * custom component composing the design rather than reinventing it: `examples/publication` renders
 * exactly this at `surface: 'viewer'`.
 */
export function OutputPreview(props: OutputPreviewProps) {
  const variants = props.variants ?? []
  const emptyVariants = props.emptyVariants ?? 0
  const typedValues = props.typedValues ?? []
  const hasVariantRow = variants.length + emptyVariants > 0
  const hasTypedValues = typedValues.length > 0

  return (
    <div
      data-testid="output-preview"
      style={{
        padding: px(outputMetrics.bodyPadding),
        display: 'flex',
        gap: px(outputMetrics.bodyGap),
      }}
    >
      <PrimaryImage {...props.primary} index={1} total={1 + variants.length} />
      <div
        data-testid="output-preview-column"
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: px(outputMetrics.rightColumnGap),
        }}
      >
        {hasVariantRow ? <VariantRow variants={variants} emptyVariants={emptyVariants} /> : null}
        {hasVariantRow && hasTypedValues ? (
          <div
            data-testid="output-preview-divider"
            style={{ height: '1px', background: borders.inlineHairline }}
          />
        ) : null}
        {hasTypedValues ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: px(outputMetrics.typedValuesGap),
            }}
          >
            <SectionLabel>Typed values</SectionLabel>
            <TypedValueGrid values={typedValues} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
