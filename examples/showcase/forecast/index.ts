import path from 'node:path'
import * as jobik from '@jobik/core'
import { fetchForecast } from './nodes/fetchForecast.js'
import { report } from './nodes/report.js'
import { forecastInput } from './nodes/start.js'
import { summarise } from './nodes/summarise.js'

/**
 * The `forecast` flow binding entrypoint.
 *
 * The showcase's pure-data example: one real HTTP call to a free public API, then two pure nodes,
 * and nothing but numbers and strings at the end. It is the counterpart to `publication`, which
 * emits an asset and registers a flow-local component to draw it — this one deliberately registers
 * nothing, so the Studio's generic value viewer is what renders the result.
 *
 * The named export is for application code; the default export is what `discoverFlows` reads. The
 * builder assigns the only id each definition ever has — `start1`, `fetch`, `summarise` and
 * `report` are the ids the canvas, `flow.jobik.json`, the run report and `run()` all use.
 */

const documentPath = path.resolve(path.dirname(import.meta.filename), 'flow.jobik.json')

/** The unbound graph, so a test can bind a copy of the document elsewhere. */
export function buildForecastFlow() {
  return jobik
    .flow('forecast')
    .start('start1', forecastInput)
    .node('fetch', fetchForecast)
    .node('summarise', summarise)
    .node('report', report)
}

export const forecast = buildForecastFlow().bind('path', documentPath)

export default forecast
