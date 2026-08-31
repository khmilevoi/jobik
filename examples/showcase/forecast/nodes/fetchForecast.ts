import * as jobik from '@jobik/core'
import * as errore from 'errore'
import * as z from 'zod'
import {
  FORECAST_DAILY_VARIABLES,
  FORECAST_MAX_DAYS,
  FORECAST_MIN_DAYS,
  FORECAST_TEMPERATURE_UNITS,
  FORECAST_TIMEZONE,
  OPEN_METEO_ENDPOINT,
} from '../types.js'

/**
 * The `Inventory` row `fetchForecast` · source, attached by `index.ts` as `fetch`.
 *
 * The one node in this flow that touches the outside world. It reads Open-Meteo's free forecast
 * endpoint — no key, no account — and flattens the answer into scalars and three parallel daily
 * series that the rest of the graph consumes field by field.
 *
 * Three things are worth copying out of here into a real handler:
 *
 * 1. `context.signal` is handed to `fetch`, so cancelling a run actually closes the socket rather
 *    than leaving it to finish into a report nobody reads.
 * 2. `context.log` writes the request and the shape of the answer into the run log. There is no
 *    percentage API — a log line is the progress channel.
 * 3. Every expected failure is **returned**, never thrown. The three classes below are declared
 *    here because `packages/core/src/errors.ts` is frozen: an example's own failure modes belong to
 *    the example. Throwing would still be contained, but the engine would wrap it in
 *    `NodeExecutionError` and the tag would be lost.
 */

/** The request never completed: DNS, TLS, a dropped connection, an offline machine. */
export class ForecastTransportError extends errore.createTaggedError({
  name: 'ForecastTransportError',
  message: 'Could not reach Open-Meteo at $url',
}) {}

/** Open-Meteo answered, but not with a 2xx. Its 400 body explains a bad coordinate or day count. */
export class ForecastResponseError extends errore.createTaggedError({
  name: 'ForecastResponseError',
  message: 'Open-Meteo answered $status for $url',
}) {
  readonly status: number

  constructor(args: { status: number; url: string; cause?: unknown }) {
    super(args)
    this.status = args.status
  }
}

/** A 2xx whose body is not the documented shape: not JSON, a missing series, ragged arrays. */
export class ForecastPayloadError extends errore.createTaggedError({
  name: 'ForecastPayloadError',
  message: 'Open-Meteo returned a payload this flow cannot read: $reason',
}) {}

/**
 * The part of Open-Meteo's answer this flow reads. A plain object rather than a strict one: the
 * response carries `generationtime_ms`, `utc_offset_seconds` and more, and none of it is this
 * flow's business.
 */
export const openMeteoResponseSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  elevation: z.number(),
  timezone: z.string(),
  daily_units: z.object({
    temperature_2m_max: z.string(),
    precipitation_sum: z.string(),
  }),
  daily: z.object({
    time: z.array(z.string()),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
    precipitation_sum: z.array(z.number()),
  }),
})

export type OpenMeteoResponse = z.output<typeof openMeteoResponseSchema>

/** The request URL, built from the start's four fields. Exported so a test can assert it. */
export function openMeteoUrl(input: {
  latitude: number
  longitude: number
  days: number
  unit: string
}): string {
  const url = new URL(OPEN_METEO_ENDPOINT)
  url.searchParams.set('latitude', String(input.latitude))
  url.searchParams.set('longitude', String(input.longitude))
  url.searchParams.set('daily', FORECAST_DAILY_VARIABLES.join(','))
  url.searchParams.set('forecast_days', String(input.days))
  url.searchParams.set('timezone', FORECAST_TIMEZONE)
  url.searchParams.set('temperature_unit', input.unit)
  return url.toString()
}

/**
 * A human label for the coordinates Open-Meteo snapped the request to. It answers on a grid, so
 * the latitude that comes back is rarely the one that went out — `50.45` becomes `50.4375`.
 */
export function formatPlace(latitude: number, longitude: number): string {
  const northing = `${Math.abs(latitude).toFixed(2)}°${latitude < 0 ? 'S' : 'N'}`
  const easting = `${Math.abs(longitude).toFixed(2)}°${longitude < 0 ? 'W' : 'E'}`
  return `${northing}, ${easting}`
}

/** The first Zod issue as one line, for the `reason` a `ForecastPayloadError` carries. */
function firstIssueOf(error: z.ZodError): string {
  const issue = error.issues[0]
  if (issue === undefined) return 'it does not match the documented shape'
  const path = issue.path.map(String).join('.')
  return path === '' ? issue.message : `${path}: ${issue.message}`
}

export const fetchForecast = jobik.node({
  title: 'Fetch forecast',
  kind: 'transform',
  input: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    days: z.number().int().min(FORECAST_MIN_DAYS).max(FORECAST_MAX_DAYS),
    unit: z.enum(FORECAST_TEMPERATURE_UNITS),
  }),
  output: z.object({
    place: z.string(),
    timezone: z.string(),
    elevation: z.number(),
    temperatureUnit: z.string(),
    precipitationUnit: z.string(),
    dates: z.array(z.string()),
    maxTemperatures: z.array(z.number()),
    minTemperatures: z.array(z.number()),
    precipitation: z.array(z.number()),
  }),
  run: async (input, context) => {
    const url = openMeteoUrl(input)
    context.log(`GET ${url}`)

    const response = await fetch(url, {
      signal: context.signal,
      headers: { accept: 'application/json' },
    }).catch((cause: unknown) => new ForecastTransportError({ url, cause }))
    if (response instanceof Error) return response

    if (!response.ok) {
      return new ForecastResponseError({ status: response.status, url })
    }

    // `.then(onFulfilled, onRejected)` rather than `try`/`catch`, so the union of "a body" and
    // "the failure" stays visible in the type and the early return below is the only exit.
    const body = await response.json().then(
      (value: unknown) => ({ value }),
      (cause: unknown) => new ForecastPayloadError({ reason: 'the body is not JSON', cause }),
    )
    if (body instanceof Error) return body

    const parsed = openMeteoResponseSchema.safeParse(body.value)
    if (!parsed.success) {
      return new ForecastPayloadError({ reason: firstIssueOf(parsed.error), cause: parsed.error })
    }

    const { daily, daily_units: units } = parsed.data
    const length = daily.time.length
    if (length === 0) {
      return new ForecastPayloadError({ reason: 'the daily series are empty' })
    }
    if (
      daily.temperature_2m_max.length !== length ||
      daily.temperature_2m_min.length !== length ||
      daily.precipitation_sum.length !== length
    ) {
      return new ForecastPayloadError({ reason: 'the daily series have different lengths' })
    }

    const place = formatPlace(parsed.data.latitude, parsed.data.longitude)
    context.log(`${length} days for ${place} (${parsed.data.timezone})`)

    return {
      place,
      timezone: parsed.data.timezone,
      elevation: parsed.data.elevation,
      temperatureUnit: units.temperature_2m_max,
      precipitationUnit: units.precipitation_sum,
      dates: daily.time,
      maxTemperatures: daily.temperature_2m_max,
      minTemperatures: daily.temperature_2m_min,
      precipitation: daily.precipitation_sum,
    }
  },
})
