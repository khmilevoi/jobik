import { reatomComponent } from '@reatom/react'
import type { OutputSurface } from '#output/flowUi.js'
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
  /**
   * Which surface this body is filling. A flow-local component forwards its own `props.surface`
   * here and gets the right geometry for free: the standalone card's fixed 336 × 236 primary and
   * 12px right-column gap, or the `2A` dock's 372px primary that grows with the dock, its 14px gap
   * and its scrolling right column. Default `viewer`.
   */
  readonly surface?: OutputSurface
}

/** design 896 and `10-output-dock.md` §2.3 — the body, and the dock's fill. */
const bodyClass = {
  card: s.preview,
  viewer: s.preview,
  dock: s.previewDock,
} satisfies Record<OutputSurface, string>

/** The right column: gap 12 on the card, gap 14 and a scrollbar in the dock. */
const columnClass = {
  card: s.column,
  viewer: s.column,
  dock: s.columnDock,
} satisfies Record<OutputSurface, string>

/**
 * design 896–950 — the whole Preview body.
 *
 * Jobik owns the viewer chrome; a flow-local output component owns this body. Exporting it keeps a
 * custom component composing the design rather than reinventing it: `examples/showcase/publication` renders
 * exactly this at `surface: 'viewer'`.
 */
export const OutputPreview = reatomComponent(function OutputPreview(props: OutputPreviewProps) {
  const surface = props.surface ?? 'viewer'
  const variants = props.variants ?? []
  const emptyVariants = props.emptyVariants ?? 0
  const typedValues = props.typedValues ?? []
  const hasVariantRow = variants.length + emptyVariants > 0
  const hasTypedValues = typedValues.length > 0

  return (
    <div data-testid="output-preview" className={bodyClass[surface]}>
      <PrimaryImage {...props.primary} index={1} total={1 + variants.length} surface={surface} />
      <div data-testid="output-preview-column" className={columnClass[surface]}>
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
}, 'OutputPreview')
