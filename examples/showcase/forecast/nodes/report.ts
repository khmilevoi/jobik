import * as jobik from '@jobik/core'
import * as z from 'zod'
import { FORECAST_TRENDS } from '../types.js'

/**
 * The `Inventory` row `report` · sink, attached by `index.ts` as `report`.
 *
 * Pure and terminal. Thirteen input fields, each one its own connection: four labels from `fetch`
 * and nine numbers and strings from `summarise`. That fan-in is the point of the node — it is
 * what a field-level graph looks like when it is doing real work, and it is the widest node card
 * in the showcase.
 *
 * `kind: 'sink'` is presentation metadata only. It groups and labels the node in the editor and
 * affects neither binding, nor validation, nor execution: a sink still returns output, and this
 * one returns the two strings the generic value viewer renders.
 */

/** The stand-in for a cell that belongs to the window rather than to any single day. */
const NO_DAY = '—'

const reportInputSchema = z.object({
  place: z.string(),
  timezone: z.string(),
  temperatureUnit: z.string(),
  precipitationUnit: z.string(),
  warmestDay: z.string(),
  warmestMax: z.number(),
  coldestDay: z.string(),
  coldestMin: z.number(),
  meanMax: z.number(),
  wettestDay: z.string(),
  wettestPrecipitation: z.number(),
  totalPrecipitation: z.number(),
  trend: z.enum(FORECAST_TRENDS),
})

export type ForecastReportInput = z.output<typeof reportInputSchema>

/** One markdown table row. */
function row(cells: readonly string[]): string {
  return `| ${cells.join(' | ')} |`
}

/** A measurement and its unit, with the unit spaced off — `29.4 °C`, `1.5 mm`. */
function measure(value: number, unit: string): string {
  return `${value} ${unit}`
}

/** The one-line summary: where, which way it is heading, and the mean daily high. */
export function forecastHeadline(input: ForecastReportInput): string {
  return `${input.place} · ${input.trend} · mean high ${measure(input.meanMax, input.temperatureUnit)}`
}

/** The whole summary as a markdown table, heading included. */
export function forecastMarkdown(input: ForecastReportInput): string {
  const degrees = input.temperatureUnit
  const millimetres = input.precipitationUnit
  return [
    `# Forecast — ${input.place}`,
    '',
    `Day boundaries in ${input.timezone}. The window is ${input.trend}.`,
    '',
    row(['Metric', 'Day', 'Value']),
    row(['---', '---', '---']),
    row(['Warmest', input.warmestDay, measure(input.warmestMax, degrees)]),
    row(['Coldest', input.coldestDay, measure(input.coldestMin, degrees)]),
    row(['Mean high', NO_DAY, measure(input.meanMax, degrees)]),
    row(['Wettest', input.wettestDay, measure(input.wettestPrecipitation, millimetres)]),
    row(['Total precipitation', NO_DAY, measure(input.totalPrecipitation, millimetres)]),
    row(['Trend', NO_DAY, input.trend]),
    '',
  ].join('\n')
}

export const report = jobik.node({
  title: 'Forecast report',
  kind: 'sink',
  input: reportInputSchema,
  output: z.object({
    headline: z.string(),
    markdown: z.string(),
  }),
  run: (input) => ({
    headline: forecastHeadline(input),
    markdown: forecastMarkdown(input),
  }),
})
