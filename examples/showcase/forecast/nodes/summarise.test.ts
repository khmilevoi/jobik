import { describe, expect, it } from 'vitest'
import { forecastExpectedSeries, forecastExpectedSummary } from '../fixtures.js'
import { FORECAST_STEADY_THRESHOLD } from '../types.js'
import {
  ForecastSeriesError,
  indexOfMax,
  indexOfMin,
  meanOf,
  roundTenths,
  summarise,
  trendOf,
} from './summarise.js'

const context = { signal: new AbortController().signal, log: () => {} }

/** The recorded series, as `summarise` receives them over four connections from `fetch`. */
const series = {
  dates: [...forecastExpectedSeries.dates],
  maxTemperatures: [...forecastExpectedSeries.maxTemperatures],
  minTemperatures: [...forecastExpectedSeries.minTemperatures],
  precipitation: [...forecastExpectedSeries.precipitation],
}

describe('the pure reducers', () => {
  it('rounds to tenths', () => {
    expect(roundTenths(26.733333333333334)).toBe(26.7)
    expect(roundTenths(15)).toBe(15)
    expect(roundTenths(-0.049)).toBe(-0)
  })

  it('averages', () => {
    expect(meanOf([29.4, 26.4, 24.4])).toBeCloseTo(26.733333, 5)
    expect(meanOf([4])).toBe(4)
  })

  it('finds the extremes', () => {
    expect(indexOfMax([1, 9, 3])).toBe(1)
    expect(indexOfMin([1, 9, 3])).toBe(0)
  })

  it('breaks a tie towards the earlier day', () => {
    expect(indexOfMax([9, 9, 3])).toBe(0)
    expect(indexOfMin([1, 1, 3])).toBe(0)
  })

  it('reads the trend from the halves of the window, not its endpoints', () => {
    expect(trendOf([10, 30, 11, 12])).toBe('cooling')
    expect(trendOf([12, 11, 30, 10])).toBe('warming')
  })

  it('calls a window with no room to move steady', () => {
    expect(trendOf([])).toBe('steady')
    expect(trendOf([21])).toBe('steady')
  })

  it('calls a difference inside the threshold steady', () => {
    const inside = FORECAST_STEADY_THRESHOLD / 2
    expect(trendOf([20, 20 + inside])).toBe('steady')
    expect(trendOf([20, 20 - inside])).toBe('steady')
    expect(trendOf([20, 20 + FORECAST_STEADY_THRESHOLD * 2])).toBe('warming')
  })
})

describe('summarise', () => {
  it('is a pure transform with the field names the card shows', () => {
    expect(summarise.kind).toBe('transform')
    expect(summarise.title).toBe('Summarise forecast')
    expect(Object.keys(summarise.input.shape)).toEqual([
      'dates',
      'maxTemperatures',
      'minTemperatures',
      'precipitation',
    ])
    expect(Object.keys(summarise.output.shape)).toEqual([
      'warmestDay',
      'warmestMax',
      'coldestDay',
      'coldestMin',
      'meanMax',
      'wettestDay',
      'wettestPrecipitation',
      'totalPrecipitation',
      'trend',
    ])
  })

  it('reduces the recorded window to the expected scalars', async () => {
    const result = await summarise.run(series, context)
    expect(result).toEqual(forecastExpectedSummary)
  })

  it('emits nothing but numbers and strings, which is what the generic viewer renders', async () => {
    const result = await summarise.run(series, context)
    if (result instanceof Error) throw result
    for (const value of Object.values(result)) {
      expect(['number', 'string']).toContain(typeof value)
    }
  })

  it('produces output its own schema accepts', async () => {
    const result = await summarise.run(series, context)
    expect(summarise.output.safeParse(result).success).toBe(true)
  })

  it('is deterministic and touches nothing outside its input', async () => {
    const first = await summarise.run(series, context)
    const second = await summarise.run(series, context)
    expect(second).toEqual(first)
  })

  it('summarises a single day without pretending to know a trend', async () => {
    const result = await summarise.run(
      {
        dates: ['2026-08-31'],
        maxTemperatures: [29.4],
        minTemperatures: [17.5],
        precipitation: [0],
      },
      context,
    )
    expect(result).toEqual({
      warmestDay: '2026-08-31',
      warmestMax: 29.4,
      coldestDay: '2026-08-31',
      coldestMin: 17.5,
      meanMax: 29.4,
      wettestDay: '2026-08-31',
      wettestPrecipitation: 0,
      totalPrecipitation: 0,
      trend: 'steady',
    })
  })

  it('returns a ForecastSeriesError for an empty window', async () => {
    const result = await summarise.run(
      { dates: [], maxTemperatures: [], minTemperatures: [], precipitation: [] },
      context,
    )
    expect(result).toBeInstanceOf(ForecastSeriesError)
    expect((result as Error).message).toContain('no days')
  })

  it('returns a ForecastSeriesError when the series do not line up', async () => {
    const result = await summarise.run({ ...series, precipitation: [0] }, context)
    expect(result).toBeInstanceOf(ForecastSeriesError)
    expect((result as Error).message).toContain('3 days against 3/3/1')
  })
})
