import path from 'node:path'
import { buildForecastFlow } from './index.js'
import { FORECAST_FLOW_NAME, FORECAST_START_ID } from './types.js'

/**
 * Fixture helpers for the `forecast` example.
 *
 * The repository gate has **no network**, and `fetchForecast` performs a real `fetch`. Every test
 * therefore stubs the global with `vi.stubGlobal('fetch', …)` and answers from the recording
 * below, which was taken once from the live endpoint:
 *
 * ```
 * curl 'https://api.open-meteo.com/v1/forecast?latitude=50.45&longitude=30.52\
 * &daily=temperature_2m_max,temperature_2m_min,precipitation_sum\
 * &forecast_days=3&timezone=UTC&temperature_unit=celsius'
 * ```
 *
 * Node-only: this file reaches the filesystem and must never be imported by browser code — that is
 * what `types.ts` is for.
 */

const root = path.dirname(import.meta.filename)

export const forecastFixture = {
  /** The example's directory. */
  root,
  /** The binding entrypoint `../jobik.config.ts` points at. Absolute. */
  bindingPath: path.resolve(root, 'index.ts'),
  /** The flow document the binding is bound to. Absolute. */
  documentPath: path.resolve(root, 'flow.jobik.json'),
  flowName: FORECAST_FLOW_NAME,
  startId: FORECAST_START_ID,
  nodeIds: ['start1', 'fetch', 'summarise', 'report'],
} as const

/** The start input the recording answers: Kyiv, three days, celsius. */
export const forecastSampleInput = {
  latitude: 50.45,
  longitude: 30.52,
  days: 3,
  unit: 'celsius',
} as const

/**
 * The recorded Open-Meteo body, field for field. `latitude` and `longitude` are the grid point the
 * service snapped the request to and not the ones that went out — that difference is real, and
 * `formatPlace` is what turns it into the label the report shows.
 */
export const openMeteoKyivBody = {
  latitude: 50.4375,
  longitude: 30.5,
  generationtime_ms: 0.05066394805908203,
  utc_offset_seconds: 0,
  timezone: 'GMT',
  timezone_abbreviation: 'GMT',
  elevation: 169,
  daily_units: {
    time: 'iso8601',
    temperature_2m_max: '°C',
    temperature_2m_min: '°C',
    precipitation_sum: 'mm',
  },
  daily: {
    time: ['2026-08-31', '2026-09-01', '2026-09-02'],
    temperature_2m_max: [29.4, 26.4, 24.4],
    temperature_2m_min: [17.5, 17.2, 15],
    precipitation_sum: [0, 1.5, 0],
  },
}

/** A JSON `Response` around any body. `status` defaults to the recording's own 200. */
export function openMeteoResponseOf(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** What `fetch` produces from the recording. */
export const forecastExpectedSeries = {
  place: '50.44°N, 30.50°E',
  timezone: 'GMT',
  elevation: 169,
  temperatureUnit: '°C',
  precipitationUnit: 'mm',
  dates: ['2026-08-31', '2026-09-01', '2026-09-02'],
  maxTemperatures: [29.4, 26.4, 24.4],
  minTemperatures: [17.5, 17.2, 15],
  precipitation: [0, 1.5, 0],
} as const

/** What `summarise` reduces that to. */
export const forecastExpectedSummary = {
  warmestDay: '2026-08-31',
  warmestMax: 29.4,
  coldestDay: '2026-09-02',
  coldestMin: 15,
  // (29.4 + 26.4 + 24.4) / 3 = 26.733…, rounded to tenths.
  meanMax: 26.7,
  wettestDay: '2026-09-01',
  wettestPrecipitation: 1.5,
  totalPrecipitation: 1.5,
  // Three days, so the halves are the first day against the last: 24.4 - 29.4 = -5.
  trend: 'cooling',
} as const

/** The same graph bound to another document. `documentPath` must be absolute. */
export function bindForecastTo(documentPath: string) {
  return buildForecastFlow().bind('path', documentPath)
}
