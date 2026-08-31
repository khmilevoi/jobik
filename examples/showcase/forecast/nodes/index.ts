import { fetchForecast } from './fetchForecast.js'
import { report } from './report.js'
import { forecastInput } from './start.js'
import { summarise } from './summarise.js'

export {
  ForecastPayloadError,
  ForecastResponseError,
  ForecastTransportError,
  fetchForecast,
  formatPlace,
  openMeteoResponseSchema,
  openMeteoUrl,
} from './fetchForecast.js'
export { forecastHeadline, forecastMarkdown, report } from './report.js'
export { forecastInput } from './start.js'
export {
  ForecastSeriesError,
  indexOfMax,
  indexOfMin,
  meanOf,
  roundTenths,
  summarise,
  trendOf,
} from './summarise.js'

/**
 * The `Inventory` group of the left sidebar: this flow's definitions with the label shown to their
 * right. Documentation, not wiring — the live sidebar derives Inventory from `definition.title`
 * server-side, and `index.ts` is what actually attaches a definition to an id.
 *
 * Unlike `publication`, every definition here is attached: the flow has four cards and the
 * inventory has four rows.
 */
export const forecastInventory = [
  { name: 'start<T>', label: 'entry', definition: forecastInput },
  { name: 'fetchForecast', label: 'source', definition: fetchForecast },
  { name: 'summarise', label: 'transform', definition: summarise },
  { name: 'report', label: 'sink', definition: report },
] as const
