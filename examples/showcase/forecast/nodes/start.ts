import * as jobik from '@jobik/core'
import * as z from 'zod'
import {
  FORECAST_DEFAULT_DAYS,
  FORECAST_DEFAULT_LATITUDE,
  FORECAST_DEFAULT_LONGITUDE,
  FORECAST_MAX_DAYS,
  FORECAST_MIN_DAYS,
  FORECAST_TEMPERATURE_UNITS,
} from '../types.js'

/**
 * The flow's only start, attached by `index.ts` as `start1`.
 *
 * A start has an input schema and no handler: its validated input becomes the start card's output
 * fields, which is why `start1` shows `latitude`, `longitude`, `days` and `unit` under `OUTPUTS`.
 *
 * Every field here is a flat scalar on purpose. The run panel derives a native control for a
 * string, a number, a boolean, an enum and a literal; an object, an array or a union falls back to
 * a raw JSON editor, and a `Date`, `Map`, `Set` or `bigint` fails the whole form. A start schema is
 * the one schema in a flow that has to obey that — a node's *output* schema may hold arrays freely,
 * because outputs are displayed and never edited.
 *
 * Every field also carries a default, so the panel opens on a runnable request rather than on four
 * empty boxes.
 */
export const forecastInput = jobik.start({
  title: 'Forecast place',
  input: z.object({
    latitude: z
      .number()
      .min(-90)
      .max(90)
      .default(FORECAST_DEFAULT_LATITUDE)
      .describe('Degrees north of the equator. Negative is south.'),
    longitude: z
      .number()
      .min(-180)
      .max(180)
      .default(FORECAST_DEFAULT_LONGITUDE)
      .describe('Degrees east of Greenwich. Negative is west.'),
    days: z
      .number()
      .int()
      .min(FORECAST_MIN_DAYS)
      .max(FORECAST_MAX_DAYS)
      .default(FORECAST_DEFAULT_DAYS)
      .describe('How many days ahead to ask for, today included.'),
    unit: z
      .enum(FORECAST_TEMPERATURE_UNITS)
      .default('celsius')
      .describe('The unit Open-Meteo reports temperatures in.'),
  }),
})
