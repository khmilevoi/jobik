import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  bindForecastTo,
  forecastExpectedSeries,
  forecastExpectedSummary,
  forecastFixture,
  forecastSampleInput,
  openMeteoKyivBody,
  openMeteoResponseOf,
} from './fixtures.js'
import { forecast } from './index.js'
import { openMeteoResponseSchema } from './nodes/fetchForecast.js'

describe('forecastFixture', () => {
  it('points at files that exist', () => {
    expect(path.isAbsolute(forecastFixture.bindingPath)).toBe(true)
    expect(fs.existsSync(forecastFixture.bindingPath)).toBe(true)
    expect(fs.existsSync(forecastFixture.documentPath)).toBe(true)
  })

  it('agrees with the bound flow about the ids', () => {
    expect(forecastFixture.documentPath).toBe(forecast.path)
    expect([...forecastFixture.nodeIds]).toEqual(Object.keys(forecast.nodes))
    expect(forecastFixture.flowName).toBe(forecast.name)
  })

  it('binds the same graph to another document', () => {
    const elsewhere = path.resolve(forecastFixture.root, 'other.jobik.json')
    expect(bindForecastTo(elsewhere).path).toBe(elsewhere)
  })
})

describe('the recorded Open-Meteo body', () => {
  it('is still the shape the node parses', () => {
    expect(openMeteoResponseSchema.safeParse(openMeteoKyivBody).success).toBe(true)
  })

  it('holds three aligned days, as the recorded request asked for', () => {
    const { daily } = openMeteoKyivBody
    expect(daily.time).toHaveLength(forecastSampleInput.days)
    expect(daily.temperature_2m_max).toHaveLength(forecastSampleInput.days)
    expect(daily.temperature_2m_min).toHaveLength(forecastSampleInput.days)
    expect(daily.precipitation_sum).toHaveLength(forecastSampleInput.days)
  })

  it('came back snapped to a grid point, which is why the report labels the answer', () => {
    expect(openMeteoKyivBody.latitude).not.toBe(forecastSampleInput.latitude)
    expect(openMeteoKyivBody.longitude).not.toBe(forecastSampleInput.longitude)
  })

  it('carries the units the expected series and summary are stated in', () => {
    expect(openMeteoKyivBody.daily_units.temperature_2m_max).toBe(
      forecastExpectedSeries.temperatureUnit,
    )
    expect(openMeteoKyivBody.daily_units.precipitation_sum).toBe(
      forecastExpectedSeries.precipitationUnit,
    )
  })

  it('supports the expected summary: its extremes really are those days', () => {
    const { time, temperature_2m_max: highs, precipitation_sum: rain } = openMeteoKyivBody.daily
    expect(time[highs.indexOf(Math.max(...highs))]).toBe(forecastExpectedSummary.warmestDay)
    expect(time[rain.indexOf(Math.max(...rain))]).toBe(forecastExpectedSummary.wettestDay)
  })
})

describe('openMeteoResponseOf', () => {
  it('answers 200 with a JSON body by default', async () => {
    const response = openMeteoResponseOf(openMeteoKyivBody)
    expect(response.ok).toBe(true)
    expect(response.headers.get('content-type')).toBe('application/json')
    await expect(response.json()).resolves.toEqual(openMeteoKyivBody)
  })

  it('can answer with a failing status, so the error paths are reachable offline', () => {
    expect(openMeteoResponseOf({ error: true }, 503).ok).toBe(false)
  })
})
