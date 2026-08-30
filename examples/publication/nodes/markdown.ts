import * as jobik from '@jobik/core'
import * as z from 'zod'
import { bodyOf, headingOf, normaliseMarkdown, wordCountOf } from './markdownText.js'

/**
 * The design's `Inventory` row `markdown` · transform.
 *
 * Authored and exported but NOT attached to the flow: the `Studio — default` artboard shows four
 * inventory rows against three node instances, and `Inventory` is read-only reference in v1. Do
 * not add it to `index.ts` — the sidebar's node count for `publication` is 3.
 */
export const markdown = jobik.node({
  title: 'Normalise markdown',
  kind: 'transform',
  input: z.object({ markdown: z.string() }),
  output: z.object({
    markdown: z.string(),
    heading: z.string(),
    wordCount: z.number().int(),
  }),
  run: (input) => ({
    markdown: normaliseMarkdown(input.markdown),
    heading: headingOf(input.markdown) ?? '',
    wordCount: wordCountOf(bodyOf(input.markdown)),
  }),
})
