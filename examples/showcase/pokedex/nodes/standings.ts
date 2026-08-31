import * as jobik from '@jobik/core'
import * as z from 'zod'
import { POKEDEX_METRICS } from '../types.js'
import { standingsSummary, standingsTable } from './standingsTable.js'

/**
 * Pipeline B's last node, attached by `index.ts` as `standings`.
 *
 * Pure and offline: it formats what `rank` already fetched. `kind: 'sink'` is presentation
 * metadata only — it groups and labels the node in the editor and affects neither binding, nor
 * validation, nor execution.
 *
 * `metric` is connected from the `roster` START rather than from `rank`, which is the whole point
 * of field-level wiring: a start may fan out to several nodes inside its own pipeline, and
 * `rank` never has to re-emit an input it was merely given.
 *
 * This node has NO entry in `flow.ui.tsx` on purpose. Pipeline A ships a flow-local component and
 * pipeline B does not, so one run shows a custom output surface and the other shows Jobik's
 * generic viewer over ordinary typed values.
 */
export const standings = jobik.node({
  title: 'Standings table',
  kind: 'sink',
  input: z.object({
    metric: z.enum(POKEDEX_METRICS),
    entries: z.array(
      z.object({
        rank: z.number().int(),
        name: z.string(),
        number: z.number().int(),
        types: z.string(),
        value: z.number().int(),
        total: z.number().int(),
      }),
    ),
    missing: z.array(z.string()),
    leader: z.string(),
    leaderValue: z.number().int(),
  }),
  output: z.object({
    table: z.string(),
    summary: z.string(),
    ranked: z.number().int(),
  }),
  run: (input) => ({
    table: standingsTable({ entries: input.entries, metric: input.metric }),
    summary: standingsSummary({
      entries: input.entries,
      missing: input.missing,
      metric: input.metric,
      leader: input.leader,
      leaderValue: input.leaderValue,
    }),
    ranked: input.entries.length,
  }),
})
