import * as jobik from '@jobik/core'
import * as z from 'zod'

/**
 * The design's `Inventory` row `start<T>` · entry, attached by `index.ts` as `start1`.
 *
 * A start has an input schema and no handler: when it is selected for a run, its validated input
 * becomes the start node's output fields — which is why the `start1` card on the canvas shows
 * `title` and `markdown` under `OUTPUTS`.
 */
export const publicationInput = jobik.start({
  title: 'Publication input',
  input: z.object({
    title: z.string(),
    // `### Run panel` draws `title` as a single line and `markdown` as a 118px monospace area.
    // Nothing else in the schema separates two bare strings, so the presentation is declared here
    // rather than guessed from whatever the draft happens to hold — which is what made the area
    // impossible to get right on first render, when the draft is empty.
    markdown: z.string().meta({ multiline: true }),
  }),
})
