import * as jobik from '@jobik/core'
import * as errore from 'errore'
import * as z from 'zod'
import { FORECAST_STEADY_THRESHOLD, FORECAST_TRENDS, type ForecastTrend } from '../types.js'

/**
 * The `Inventory` row `summarise` · transform, attached by `index.ts` as `summarise`.
 *
 * Pure, offline and deterministic: it takes the three daily series `fetch` produced and reduces
 * them to eight flat scalars. Arrays go in — a node's *input* schema may hold them, only a start's
 * may not — and nothing but numbers, strings and one enum comes out, which is exactly what the
 * Studio's generic value viewer is good at rendering.
 *
 * This is the node to read first when learning the shape of a handler: no `await`, no `context`,
 * one expected failure returned as a value.
 */

/** The series arrived, but they cannot be reduced: empty, or not the same length as each other. */
export class ForecastSeriesError extends errore.createTaggedError({
  name: 'ForecastSeriesError',
  message: 'The daily series cannot be summarised: $reason',
}) {}

/** Round to one decimal, so a mean of `26.733333333333334` reads as `26.7`. */
export function roundTenths(value: number): number {
  return Math.round(value * 10) / 10
}

/** The arithmetic mean. Precondition: `values` is not empty. */
export function meanOf(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length
}

/** The index of the largest value; the earliest one on a tie. Precondition: not empty. */
export function indexOfMax(values: readonly number[]): number {
  return values.reduce((best, value, index) => (value > values[best] ? index : best), 0)
}

/** The index of the smallest value; the earliest one on a tie. Precondition: not empty. */
export function indexOfMin(values: readonly number[]): number {
  return values.reduce((best, value, index) => (value < values[best] ? index : best), 0)
}

/**
 * Which way the window is heading: the mean of its closing half against the mean of its opening
 * half. Comparing halves rather than the first and last day keeps one freak day from naming the
 * whole week. A window shorter than two days, or a difference inside
 * `FORECAST_STEADY_THRESHOLD`, is `steady`.
 */
export function trendOf(maxima: readonly number[]): ForecastTrend {
  if (maxima.length < 2) return 'steady'
  const half = Math.floor(maxima.length / 2)
  const delta = meanOf(maxima.slice(maxima.length - half)) - meanOf(maxima.slice(0, half))
  if (Math.abs(delta) < FORECAST_STEADY_THRESHOLD) return 'steady'
  return delta > 0 ? 'warming' : 'cooling'
}

export const summarise = jobik.node({
  title: 'Summarise forecast',
  kind: 'transform',
  input: z.object({
    dates: z.array(z.string()),
    maxTemperatures: z.array(z.number()),
    minTemperatures: z.array(z.number()),
    precipitation: z.array(z.number()),
  }),
  output: z.object({
    warmestDay: z.string(),
    warmestMax: z.number(),
    coldestDay: z.string(),
    coldestMin: z.number(),
    meanMax: z.number(),
    wettestDay: z.string(),
    wettestPrecipitation: z.number(),
    totalPrecipitation: z.number(),
    trend: z.enum(FORECAST_TRENDS),
  }),
  run: (input) => {
    const { dates, maxTemperatures, minTemperatures, precipitation } = input
    if (dates.length === 0) {
      return new ForecastSeriesError({ reason: 'there are no days in the window' })
    }
    if (
      maxTemperatures.length !== dates.length ||
      minTemperatures.length !== dates.length ||
      precipitation.length !== dates.length
    ) {
      return new ForecastSeriesError({
        reason: `${dates.length} days against ${maxTemperatures.length}/${minTemperatures.length}/${precipitation.length} readings`,
      })
    }

    const warmest = indexOfMax(maxTemperatures)
    const coldest = indexOfMin(minTemperatures)
    const wettest = indexOfMax(precipitation)

    return {
      warmestDay: dates[warmest],
      warmestMax: maxTemperatures[warmest],
      coldestDay: dates[coldest],
      coldestMin: minTemperatures[coldest],
      meanMax: roundTenths(meanOf(maxTemperatures)),
      wettestDay: dates[wettest],
      wettestPrecipitation: precipitation[wettest],
      totalPrecipitation: roundTenths(precipitation.reduce((total, mm) => total + mm, 0)),
      trend: trendOf(maxTemperatures),
    }
  },
})
