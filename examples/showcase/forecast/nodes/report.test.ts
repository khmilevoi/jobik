import { describe, expect, it } from 'vitest'
import { forecastExpectedSeries, forecastExpectedSummary } from '../fixtures.js'
import { forecastHeadline, forecastMarkdown, report } from './report.js'

const context = { signal: new AbortController().signal, log: () => {} }

/** The thirteen fields the document connects into `report`: four from `fetch`, nine from `summarise`. */
const input = {
  place: forecastExpectedSeries.place,
  timezone: forecastExpectedSeries.timezone,
  temperatureUnit: forecastExpectedSeries.temperatureUnit,
  precipitationUnit: forecastExpectedSeries.precipitationUnit,
  ...forecastExpectedSummary,
}

const expectedMarkdown = [
  '# Forecast — 50.44°N, 30.50°E',
  '',
  'Day boundaries in GMT. The window is cooling.',
  '',
  '| Metric | Day | Value |',
  '| --- | --- | --- |',
  '| Warmest | 2026-08-31 | 29.4 °C |',
  '| Coldest | 2026-09-02 | 15 °C |',
  '| Mean high | — | 26.7 °C |',
  '| Wettest | 2026-09-01 | 1.5 mm |',
  '| Total precipitation | — | 1.5 mm |',
  '| Trend | — | cooling |',
  '',
].join('\n')

describe('forecastHeadline', () => {
  it('says where, which way, and how warm', () => {
    expect(forecastHeadline(input)).toBe('50.44°N, 30.50°E · cooling · mean high 26.7 °C')
  })
})

describe('forecastMarkdown', () => {
  it('renders the summary as a markdown table', () => {
    expect(forecastMarkdown(input)).toBe(expectedMarkdown)
  })

  it('reads the units off its input rather than hard-coding celsius', () => {
    const fahrenheit = forecastMarkdown({ ...input, temperatureUnit: '°F', warmestMax: 84.9 })
    expect(fahrenheit).toContain('| Warmest | 2026-08-31 | 84.9 °F |')
    expect(fahrenheit).not.toContain('°C')
  })

  it('keeps every row three cells wide, so the table parses', () => {
    const rows = forecastMarkdown(input)
      .split('\n')
      .filter((line) => line.startsWith('|'))
    expect(rows).toHaveLength(8)
    for (const row of rows) {
      expect(row.split('|')).toHaveLength(5)
    }
  })
})

describe('report', () => {
  it('is a sink definition with the thirteen inputs the card shows', () => {
    expect(report.kind).toBe('sink')
    expect(report.title).toBe('Forecast report')
    expect(Object.keys(report.input.shape)).toEqual([
      'place',
      'timezone',
      'temperatureUnit',
      'precipitationUnit',
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
    expect(Object.keys(report.output.shape)).toEqual(['headline', 'markdown'])
  })

  it('emits the headline and the table', async () => {
    const result = await report.run(input, context)
    expect(result).toEqual({ headline: forecastHeadline(input), markdown: expectedMarkdown })
  })

  it('produces output its own schema accepts', async () => {
    const result = await report.run(input, context)
    expect(report.output.safeParse(result).success).toBe(true)
  })

  it('accepts every field summarise produces, and rejects a trend it does not know', () => {
    expect(report.input.safeParse(input).success).toBe(true)
    expect(report.input.safeParse({ ...input, trend: 'sideways' }).success).toBe(false)
  })
})
