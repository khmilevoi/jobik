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
  POKEDEX_CARD_ASSET_NAME,
  POKEDEX_CARD_HEIGHT,
  POKEDEX_CARD_MIME,
  POKEDEX_CARD_WIDTH,
  typeColour,
} from '../types.js'

/**
 * The flow-local output component for the `compose` node — pipeline A only.
 *
 * Jobik keeps the node header, the input controls, the handles, the status and the error display,
 * and the whole output viewer chrome; this fills the `Preview` tab and the node card's inline
 * output slot, and has to read at both sizes — roughly 140px inside a card, full panel width in
 * the viewer, and the dock's taller primary column in between.
 *
 * `standings` deliberately has NO entry in `flow.ui.tsx`: running the `roster` start shows Jobik's
 * generic viewer over ordinary typed values, so the two pipelines demonstrate both output paths.
 *
 * Imports only `@jobik/ui` and `../types.js` — never a handler, never a `node:` builtin. On the
 * wire a binary field is an `AssetDescriptor`, not a `Buffer`, so `isAssetDescriptor` is what
 * narrows it.
 */
export function PokedexCard(props: OutputComponentProps) {
  const image = isAssetDescriptor(props.output.image) ? props.output.image : undefined
  const caption = typeof props.output.caption === 'string' ? props.output.caption : undefined
  const primaryType =
    typeof props.output.primaryType === 'string' ? props.output.primaryType : undefined
  const secondaryType =
    typeof props.output.secondaryType === 'string' && props.output.secondaryType.length > 0
      ? props.output.secondaryType
      : undefined
  const src = image === undefined ? undefined : props.assetUrl(image)
  const types = [primaryType, secondaryType].filter((name) => name !== undefined)

  if (props.surface === 'card') {
    if (src === undefined) {
      return (
        <StripePlaceholder
          height={canvasMetrics.outputSlotMediaHeight}
          radius={radii.badge}
          label={POKEDEX_CARD_ASSET_NAME}
        />
      )
    }
    return (
      <img
        alt={caption ?? POKEDEX_CARD_ASSET_NAME}
        src={src}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          // The pokémon's own type colour, which is flow data rather than Studio chrome — the
          // only reason a colour is spelled in this file at all.
          borderBottom:
            primaryType === undefined ? undefined : `3px solid ${typeColour(primaryType)}`,
        }}
      />
    )
  }

  // Named after `compose`'s own output fields rather than both being `type`: the grid keys its
  // rows by name, so two rows called `type` would collide.
  const typedValues: TypedValue[] = []
  if (caption !== undefined) typedValues.push({ name: 'caption', value: caption })
  if (primaryType !== undefined) typedValues.push({ name: 'primaryType', value: primaryType })
  if (secondaryType !== undefined) typedValues.push({ name: 'secondaryType', value: secondaryType })
  if (image !== undefined) typedValues.push({ name: 'bytes', value: image.bytes })

  return (
    <OutputPreview
      primary={{
        src,
        label: POKEDEX_CARD_ASSET_NAME,
        meta: [
          `${POKEDEX_CARD_WIDTH}×${POKEDEX_CARD_HEIGHT}`,
          POKEDEX_CARD_MIME.replace('image/', ''),
          ...(image === undefined ? [] : [formatBytes(image.bytes)]),
        ],
        metaTrailing: types.length === 0 ? undefined : types.join(' / '),
      }}
      emptyVariants={1}
      typedValues={typedValues}
      // Forwarding the surface is what lets the same component take the dock's taller primary
      // column instead of the standalone card's fixed geometry.
      surface={props.surface}
    />
  )
}
