import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import defaultExport, { buildForecastFlow, forecast } from './index.js'
import { forecastInventory } from './nodes/index.js'
import { FORECAST_DEFAULT_DAYS, FORECAST_FLOW_NAME, FORECAST_MAX_DAYS } from './types.js'

describe('forecast binding', () => {
  it('is named after the flow the top bar shows', () => {
    expect(forecast.name).toBe(FORECAST_FLOW_NAME)
  })

  it('binds to the absolute path of its own document', () => {
    expect(path.isAbsolute(forecast.path)).toBe(true)
    expect(path.basename(forecast.path)).toBe('flow.jobik.json')
    expect(path.dirname(forecast.path)).toBe(path.dirname(import.meta.filename))
  })

  it('exposes the same value as the default export used for UI discovery', () => {
    expect(defaultExport).toBe(forecast)
  })

  it('attaches exactly the four nodes the canvas shows, in order', () => {
    expect(Object.keys(forecast.nodes)).toEqual(['start1', 'fetch', 'summarise', 'report'])
  })

  it('attaches them with the kinds the sidebar lists', () => {
    expect(forecast.nodes.start1.kind).toBe('start')
    expect(forecast.nodes.fetch.kind).toBe('transform')
    expect(forecast.nodes.summarise.kind).toBe('transform')
    expect(forecast.nodes.report.kind).toBe('sink')
  })

  it('exposes the field names the node cards show', () => {
    expect(Object.keys(forecast.nodes.start1.input.shape)).toEqual([
      'latitude',
      'longitude',
      'days',
      'unit',
    ])
    expect(Object.keys(forecast.nodes.fetch.input.shape)).toEqual(
      Object.keys(forecast.nodes.start1.input.shape),
    )
    expect(Object.keys(forecast.nodes.summarise.input.shape)).toEqual([
      'dates',
      'maxTemperatures',
      'minTemperatures',
      'precipitation',
    ])
    expect(Object.keys(forecast.nodes.report.output.shape)).toEqual(['headline', 'markdown'])
  })

  it('can be rebound to another absolute path without duplicating the graph', () => {
    const elsewhere = path.resolve(path.dirname(import.meta.filename), 'other.jobik.json')
    const rebound = buildForecastFlow().bind('path', elsewhere)
    expect(rebound.path).toBe(elsewhere)
    expect(Object.keys(rebound.nodes)).toEqual(['start1', 'fetch', 'summarise', 'report'])
    expect(rebound.nodes.fetch).toBe(forecast.nodes.fetch)
  })

  it('rejects a relative binding path', () => {
    expect(() => buildForecastFlow().bind('path', 'flow.jobik.json')).toThrow(TypeError)
  })
})

describe('the start schema the run panel derives its controls from', () => {
  const shape = forecast.nodes.start1.input

  it('is flat scalars only, so no field falls back to the raw JSON editor', () => {
    for (const field of Object.values(shape.shape)) {
      const parsed = field.safeParse([])
      expect(parsed.success).toBe(false)
    }
  })

  it('runs on its defaults alone', () => {
    const parsed = shape.safeParse({})
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.days).toBe(FORECAST_DEFAULT_DAYS)
    expect(parsed.data.unit).toBe('celsius')
    expect(typeof parsed.data.latitude).toBe('number')
  })

  it('rejects a place that is not on the planet', () => {
    expect(shape.safeParse({ latitude: 91 }).success).toBe(false)
    expect(shape.safeParse({ longitude: -181 }).success).toBe(false)
  })

  it('rejects a window Open-Meteo would refuse', () => {
    expect(shape.safeParse({ days: 0 }).success).toBe(false)
    expect(shape.safeParse({ days: FORECAST_MAX_DAYS + 1 }).success).toBe(false)
    expect(shape.safeParse({ days: 3.5 }).success).toBe(false)
  })

  it('rejects a unit the endpoint does not offer', () => {
    expect(shape.safeParse({ unit: 'kelvin' }).success).toBe(false)
  })
})

describe('forecastInventory', () => {
  it('lists the four definitions the sidebar Inventory group shows', () => {
    expect(forecastInventory.map((entry) => entry.name)).toEqual([
      'start<T>',
      'fetchForecast',
      'summarise',
      'report',
    ])
    expect(forecastInventory.map((entry) => entry.label)).toEqual([
      'entry',
      'source',
      'transform',
      'sink',
    ])
  })

  it('points at the definitions the flow actually attached, one row per card', () => {
    expect(forecastInventory).toHaveLength(Object.keys(forecast.nodes).length)
    expect(forecastInventory[0].definition).toBe(forecast.nodes.start1)
    expect(forecastInventory[1].definition).toBe(forecast.nodes.fetch)
    expect(forecastInventory[2].definition).toBe(forecast.nodes.summarise)
    expect(forecastInventory[3].definition).toBe(forecast.nodes.report)
  })
})
