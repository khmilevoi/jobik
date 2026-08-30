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
  input: z.object({ title: z.string(), markdown: z.string() }),
})
