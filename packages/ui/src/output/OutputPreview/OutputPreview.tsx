import { type OutputPrimarySpec, PrimaryImage } from '#output/PrimaryImage/PrimaryImage.js'
import { type TypedValue, TypedValueGrid } from '#output/TypedValueGrid/TypedValueGrid.js'
import { VariantRow, type VariantSpec } from '#output/VariantRow/VariantRow.js'
import { SectionLabel } from '#primitives/index.js'
import s from './OutputPreview.module.css'

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
    <div data-testid="output-preview" className={s.preview}>
      <PrimaryImage {...props.primary} index={1} total={1 + variants.length} />
      <div data-testid="output-preview-column" className={s.column}>
        {hasVariantRow ? <VariantRow variants={variants} emptyVariants={emptyVariants} /> : null}
        {hasVariantRow && hasTypedValues ? (
          <div data-testid="output-preview-divider" className={s.divider} />
        ) : null}
        {hasTypedValues ? (
          <div className={s.typedBlock}>
            <SectionLabel>Typed values</SectionLabel>
            <TypedValueGrid values={typedValues} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
