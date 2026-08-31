import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  forecastExpectedSeries,
  forecastSampleInput,
  openMeteoKyivBody,
  openMeteoResponseOf,
} from '../fixtures.js'
import { FORECAST_DAILY_VARIABLES, FORECAST_TIMEZONE, OPEN_METEO_ENDPOINT } from '../types.js'
import {
  ForecastPayloadError,
  ForecastResponseError,
  ForecastTransportError,
  fetchForecast,
  formatPlace,
  openMeteoUrl,
} from './fetchForecast.js'

/**
 * The gate has no network. Every test here stubs the global `fetch` and answers from the recording
 * in `../fixtures.ts`; nothing in this file may reach the real endpoint.
 */

const context = { signal: new AbortController().signal, log: () => {} }

type FetchStub = (input: string | URL, init?: RequestInit) => Promise<Response>

function stubFetch(handler: FetchStub) {
  const spy = vi.fn(handler)
  vi.stubGlobal('fetch', spy)
  return spy
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('openMeteoUrl', () => {
  it('asks the documented endpoint for the three daily series', () => {
    const url = new URL(openMeteoUrl(forecastSampleInput))
    expect(`${url.origin}${url.pathname}`).toBe(OPEN_METEO_ENDPOINT)
    expect(url.searchParams.get('daily')).toBe(FORECAST_DAILY_VARIABLES.join(','))
    expect(url.searchParams.get('latitude')).toBe('50.45')
    expect(url.searchParams.get('longitude')).toBe('30.52')
    expect(url.searchParams.get('forecast_days')).toBe('3')
    expect(url.searchParams.get('temperature_unit')).toBe('celsius')
  })

  it('pins the timezone, so a run is reproducible rather than located', () => {
    const url = new URL(openMeteoUrl(forecastSampleInput))
    expect(url.searchParams.get('timezone')).toBe(FORECAST_TIMEZONE)
  })

  it('carries no key, header or credential — the endpoint is free', () => {
    expect(openMeteoUrl(forecastSampleInput)).not.toMatch(/key|token|apikey/i)
  })
})

describe('formatPlace', () => {
  it('labels the grid point Open-Meteo snapped to', () => {
    expect(formatPlace(50.4375, 30.5)).toBe('50.44°N, 30.50°E')
  })

  it('names the other two hemispheres', () => {
    expect(formatPlace(-33.87, -151.21)).toBe('33.87°S, 151.21°W')
  })
})

describe('fetchForecast', () => {
  it('is a transform definition with the field names the card shows', () => {
    expect(fetchForecast.kind).toBe('transform')
    expect(fetchForecast.title).toBe('Fetch forecast')
    expect(Object.keys(fetchForecast.input.shape)).toEqual([
      'latitude',
      'longitude',
      'days',
      'unit',
    ])
    expect(Object.keys(fetchForecast.output.shape)).toEqual([
      'place',
      'timezone',
      'elevation',
      'temperatureUnit',
      'precipitationUnit',
      'dates',
      'maxTemperatures',
      'minTemperatures',
      'precipitation',
    ])
  })

  it('flattens the recorded answer into scalars and three parallel series', async () => {
    const spy = stubFetch(async () => openMeteoResponseOf(openMeteoKyivBody))
    const result = await fetchForecast.run(forecastSampleInput, context)
    if (result instanceof Error) throw result
    expect(result).toEqual(forecastExpectedSeries)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('produces output its own schema accepts', async () => {
    stubFetch(async () => openMeteoResponseOf(openMeteoKyivBody))
    const result = await fetchForecast.run(forecastSampleInput, context)
    expect(fetchForecast.output.safeParse(result).success).toBe(true)
  })

  it('requests the URL it built, and hands the run signal to fetch', async () => {
    const controller = new AbortController()
    const spy = stubFetch(async () => openMeteoResponseOf(openMeteoKyivBody))
    await fetchForecast.run(forecastSampleInput, { signal: controller.signal, log: () => {} })
    expect(spy.mock.calls[0][0]).toBe(openMeteoUrl(forecastSampleInput))
    expect(spy.mock.calls[0][1]?.signal).toBe(controller.signal)
  })

  it('logs the request and what came back', async () => {
    stubFetch(async () => openMeteoResponseOf(openMeteoKyivBody))
    const lines: string[] = []
    await fetchForecast.run(forecastSampleInput, {
      signal: context.signal,
      log: (message) => lines.push(message),
    })
    expect(lines[0]).toBe(`GET ${openMeteoUrl(forecastSampleInput)}`)
    expect(lines[1]).toBe('3 days for 50.44°N, 30.50°E (GMT)')
  })

  it('returns a ForecastResponseError when the service answers with a non-2xx', async () => {
    stubFetch(async () => openMeteoResponseOf({ error: true, reason: 'nope' }, 400))
    const result = await fetchForecast.run(forecastSampleInput, context)
    expect(result).toBeInstanceOf(ForecastResponseError)
    if (!(result instanceof ForecastResponseError)) throw new Error('expected the tagged error')
    expect(result.status).toBe(400)
    expect(result.message).toContain('400')
  })

  it('returns a ForecastTransportError when the request never completes', async () => {
    const offline = new TypeError('fetch failed')
    stubFetch(async () => {
      throw offline
    })
    const result = await fetchForecast.run(forecastSampleInput, context)
    expect(result).toBeInstanceOf(ForecastTransportError)
    expect((result as ForecastTransportError).cause).toBe(offline)
  })

  it('returns a ForecastPayloadError when a 2xx body is not JSON', async () => {
    stubFetch(async () => new Response('<html>maintenance</html>', { status: 200 }))
    const result = await fetchForecast.run(forecastSampleInput, context)
    expect(result).toBeInstanceOf(ForecastPayloadError)
    expect((result as Error).message).toContain('not JSON')
  })

  it('returns a ForecastPayloadError when a documented field is missing', async () => {
    const { daily: _dropped, ...withoutDaily } = openMeteoKyivBody
    stubFetch(async () => openMeteoResponseOf(withoutDaily))
    const result = await fetchForecast.run(forecastSampleInput, context)
    expect(result).toBeInstanceOf(ForecastPayloadError)
    expect((result as Error).message).toContain('daily')
  })

  it('returns a ForecastPayloadError when a series holds the wrong type', async () => {
    const body = {
      ...openMeteoKyivBody,
      daily: { ...openMeteoKyivBody.daily, temperature_2m_max: ['warm', 'warmer', 'warmest'] },
    }
    stubFetch(async () => openMeteoResponseOf(body))
    const result = await fetchForecast.run(forecastSampleInput, context)
    expect(result).toBeInstanceOf(ForecastPayloadError)
  })

  it('returns a ForecastPayloadError when the series are ragged', async () => {
    const body = {
      ...openMeteoKyivBody,
      daily: { ...openMeteoKyivBody.daily, precipitation_sum: [0, 1.5] },
    }
    stubFetch(async () => openMeteoResponseOf(body))
    const result = await fetchForecast.run(forecastSampleInput, context)
    expect(result).toBeInstanceOf(ForecastPayloadError)
    expect((result as Error).message).toContain('different lengths')
  })

  it('returns a ForecastPayloadError when the window came back empty', async () => {
    const body = {
      ...openMeteoKyivBody,
      daily: {
        time: [],
        temperature_2m_max: [],
        temperature_2m_min: [],
        precipitation_sum: [],
      },
    }
    stubFetch(async () => openMeteoResponseOf(body))
    const result = await fetchForecast.run(forecastSampleInput, context)
    expect(result).toBeInstanceOf(ForecastPayloadError)
    expect((result as Error).message).toContain('empty')
  })

  it('returns every failure rather than throwing it', async () => {
    stubFetch(async () => {
      throw new TypeError('fetch failed')
    })
    await expect(fetchForecast.run(forecastSampleInput, context)).resolves.toBeInstanceOf(Error)
  })
})
