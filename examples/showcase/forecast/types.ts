/**
 * Browser-safe shared types and constants for the `forecast` flow.
 *
 * `flow.ui.tsx` imports only from this file, so nothing here may import a handler, a `node:`
 * builtin, or `./nodes/`. Everything is either a literal constant or a type.
 *
 * This flow is the showcase's *pure data* example: it reads a free public API and emits nothing
 * but numbers and strings, so the Studio renders every one of its outputs with the generic value
 * viewer. That is deliberate — see `flow.ui.tsx`.
 */

/** The flow name the builder assigns, shown in the top bar and the `Flows` list. */
export const FORECAST_FLOW_NAME = 'forecast'

/** The only start this flow declares. */
export const FORECAST_START_ID = 'start1'

/** Open-Meteo's free forecast endpoint. No key, no account, no quota header. */
export const OPEN_METEO_ENDPOINT = 'https://api.open-meteo.com/v1/forecast'

/**
 * The three daily series the flow asks for, in the order they are named in the `daily` query
 * parameter. Open-Meteo keys its `daily` object by exactly these names.
 */
export const FORECAST_DAILY_VARIABLES = [
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
] as const

/**
 * The timezone the flow pins the request to. Fixing it keeps a run reproducible: with `auto`
 * Open-Meteo would pick a zone from the coordinates and the day boundaries would move with it.
 */
export const FORECAST_TIMEZONE = 'UTC'

/** Open-Meteo accepts `forecast_days` from 1 to 16; the run panel offers the useful part of that. */
export const FORECAST_MIN_DAYS = 1
export const FORECAST_MAX_DAYS = 14
export const FORECAST_DEFAULT_DAYS = 7

/** Kyiv. The coordinates the run panel opens on, so the example runs without being filled in. */
export const FORECAST_DEFAULT_LATITUDE = 50.45
export const FORECAST_DEFAULT_LONGITUDE = 30.52

/** The two values Open-Meteo's `temperature_unit` parameter accepts. */
export const FORECAST_TEMPERATURE_UNITS = ['celsius', 'fahrenheit'] as const

export type ForecastTemperatureUnit = (typeof FORECAST_TEMPERATURE_UNITS)[number]

/** Which way the daily maxima are heading across the requested window. */
export const FORECAST_TRENDS = ['warming', 'cooling', 'steady'] as const

export type ForecastTrend = (typeof FORECAST_TRENDS)[number]

/**
 * How far the closing half of the daily maxima must sit from the opening half, in whatever unit
 * was requested, before the window counts as anything but `steady`.
 */
export const FORECAST_STEADY_THRESHOLD = 0.5

/** Every id the flow builder assigns, in the order `index.ts` attaches them. */
export type ForecastNodeId = 'start1' | 'fetch' | 'summarise' | 'report'

/** What a caller hands `run('start1', input)`. Every field has a default, so all four are optional. */
export type ForecastStartInput = {
  readonly latitude?: number
  readonly longitude?: number
  readonly days?: number
  readonly unit?: ForecastTemperatureUnit
}

/** `fetch`'s output: the place it resolved to, the units it answered in, and three daily series. */
export type ForecastSeriesOutput = {
  readonly place: string
  readonly timezone: string
  readonly elevation: number
  readonly temperatureUnit: string
  readonly precipitationUnit: string
  readonly dates: readonly string[]
  readonly maxTemperatures: readonly number[]
  readonly minTemperatures: readonly number[]
  readonly precipitation: readonly number[]
}

/** `summarise`'s output. Flat scalars only — this is what the generic value viewer renders. */
export type ForecastSummaryOutput = {
  readonly warmestDay: string
  readonly warmestMax: number
  readonly coldestDay: string
  readonly coldestMin: number
  readonly meanMax: number
  readonly wettestDay: string
  readonly wettestPrecipitation: number
  readonly totalPrecipitation: number
  readonly trend: ForecastTrend
}

/** `report`'s output: a one-line headline and the same summary as a markdown table. */
export type ForecastReportOutput = {
  readonly headline: string
  readonly markdown: string
}
