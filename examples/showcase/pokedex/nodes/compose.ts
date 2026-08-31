import * as jobik from '@jobik/core'
import * as errore from 'errore'
import * as z from 'zod'
import { POKEDEX_ARTWORK_MIME, POKEDEX_CARD_MIME, POKEDEX_THEMES } from '../types.js'
import { type CardSubject, captionFor, renderCard } from './cardArt.js'

/**
 * Pipeline A's last node, attached by `index.ts` as `compose`.
 *
 * Takes the flattened record from `lookup`, the downloaded artwork from `sprite` and the theme
 * straight from the `card` start, and emits the rendered card plus the caption the output viewer
 * prints under it. Both output fields are top-level, which is what makes `image` a registered
 * asset rather than an unnoticed `Buffer`.
 */

/** The example's own expected failure: jimp could not decode or encode. */
export class CardRenderError extends errore.createTaggedError({
  name: 'CardRenderError',
  message: 'The pokédex card for $subject could not be rendered',
}) {}

export const compose = jobik.node({
  title: 'Compose card',
  kind: 'transform',
  input: z.object({
    displayName: z.string(),
    number: z.number().int(),
    primaryType: z.string(),
    secondaryType: z.string(),
    stats: z.array(z.object({ label: z.string(), base: z.number().int() })),
    theme: z.enum(POKEDEX_THEMES),
    sprite: jobik.asset({ mime: POKEDEX_ARTWORK_MIME }),
  }),
  output: z.object({
    image: jobik.asset({ mime: POKEDEX_CARD_MIME }),
    caption: z.string(),
    // Re-emitted so `components/PokedexCard.tsx` can paint the type chips from data rather than
    // parsing them back out of `caption`. A flow-local component sees the OUTPUT object, so
    // anything it needs has to be a field.
    primaryType: z.string(),
    secondaryType: z.string(),
  }),
  run: async (input, context) => {
    const subject: CardSubject = {
      displayName: input.displayName,
      number: input.number,
      primaryType: input.primaryType,
      secondaryType: input.secondaryType,
      stats: input.stats,
      theme: input.theme,
    }
    context.log(`composing a ${input.theme} card for ${input.displayName}`)

    // jimp throws on an undecodable buffer, and a throw would reach the engine as an untagged
    // `NodeExecutionError`. Catching it here is what keeps the failure this example's own.
    const image = await renderCard({ subject, artworkPng: input.sprite }).catch(
      (cause: unknown) => new CardRenderError({ subject: input.displayName, cause }),
    )
    if (image instanceof Error) return image

    context.log(`${image.byteLength} bytes of PNG`)
    return {
      image,
      caption: captionFor(subject),
      primaryType: input.primaryType,
      secondaryType: input.secondaryType,
    }
  },
})
