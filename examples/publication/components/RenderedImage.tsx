import type { OutputComponentProps, TypedValue } from '@jobik/ui'
import {
  canvasMetrics,
  formatBytes,
  isAssetDescriptor,
  OutputPreview,
  radii,
  StripePlaceholder,
} from '@jobik/ui'
import {
  PUBLICATION_ASSET_NAME,
  PUBLICATION_COLOUR_PROFILE,
  PUBLICATION_IMAGE_HEIGHT,
  PUBLICATION_IMAGE_MIME,
  PUBLICATION_IMAGE_WIDTH,
} from '../types.js'

/**
 * The flow-local output component for the `render` node.
 *
 * Jobik keeps the node header, the input controls, the handles, the status and the error display,
 * and the whole output viewer chrome; this fills the `Preview` tab and the node card's inline
 * output slot, and must read at both sizes — roughly 140px inside a card, full panel width in the
 * viewer.
 *
 * `imageOut` emits one `image` and one `caption`, so that is what this renders. The artboard's
 * three variants belong to the viewer's own fixture, not to this flow.
 *
 * Imports only `@jobik/ui` and `../types.js` — never a handler, never a `node:` builtin.
 */
export function RenderedImage(props: OutputComponentProps) {
  const image = isAssetDescriptor(props.output.image) ? props.output.image : undefined
  const caption = typeof props.output.caption === 'string' ? props.output.caption : undefined
  const src = image === undefined ? undefined : props.assetUrl(image)

  if (props.surface === 'card') {
    return src === undefined ? (
      <StripePlaceholder
        height={canvasMetrics.outputSlotMediaHeight}
        radius={radii.badge}
        label={PUBLICATION_ASSET_NAME}
      />
    ) : (
      <img
        alt={caption ?? PUBLICATION_ASSET_NAME}
        src={src}
        style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
      />
    )
  }

  const typedValues: TypedValue[] = []
  if (caption !== undefined) typedValues.push({ name: 'caption', value: caption })
  if (image !== undefined) typedValues.push({ name: 'bytes', value: image.bytes })

  return (
    <OutputPreview
      primary={{
        src,
        label: PUBLICATION_ASSET_NAME,
        meta: [
          `${PUBLICATION_IMAGE_WIDTH}×${PUBLICATION_IMAGE_HEIGHT}`,
          PUBLICATION_IMAGE_MIME.replace('image/', ''),
          ...(image === undefined ? [] : [formatBytes(image.bytes)]),
        ],
        metaTrailing: PUBLICATION_COLOUR_PROFILE,
      }}
      emptyVariants={1}
      typedValues={typedValues}
    />
  )
}
