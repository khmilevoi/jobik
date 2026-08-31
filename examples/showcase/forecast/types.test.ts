import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  FORECAST_DAILY_VARIABLES,
  FORECAST_DEFAULT_DAYS,
  FORECAST_MAX_DAYS,
  FORECAST_MIN_DAYS,
  FORECAST_TEMPERATURE_UNITS,
  FORECAST_TRENDS,
  OPEN_METEO_ENDPOINT,
} from './types.js'

/**
 * `types.ts` is the file `flow.ui.tsx` is allowed to import, so its browser-safety cannot regress
 * silently. This reads the source text rather than importing the module, because importing it
 * would prove nothing about which `node:` builtins or handlers it pulls in transitively.
 */

const typesPath = path.resolve(path.dirname(import.meta.filename), 'types.ts')
const source = fs.readFileSync(typesPath, 'utf8')
const importLines = source.split('\n').filter((line) => /^\s*import\b/.test(line))

describe('types.ts stays browser-safe', () => {
  it('imports no node: builtin', () => {
    expect(source, 'types.ts must not import a node: builtin').not.toMatch(/from\s+['"]node:/)
  })

  it('imports nothing from ./nodes/', () => {
    expect(source, 'types.ts must not import a handler from ./nodes/').not.toMatch(
      /from\s+['"]\.\/nodes\//,
    )
  })

  it('every import statement it has is type-only', () => {
    for (const line of importLines) {
      expect(line, `expected a type-only import, got: ${line.trim()}`).toMatch(/^\s*import type\b/)
    }
  })

  it('declares no node and no start, so nothing in it can run', () => {
    expect(source).not.toMatch(/jobik\.(node|start)\(/)
  })
})

describe('the constants the nodes and the document agree on', () => {
  it('names the free endpoint over https', () => {
    expect(OPEN_METEO_ENDPOINT.startsWith('https://')).toBe(true)
    expect(new URL(OPEN_METEO_ENDPOINT).hostname).toBe('api.open-meteo.com')
  })

  it('lists the three daily series Open-Meteo keys its answer by', () => {
    expect(FORECAST_DAILY_VARIABLES).toEqual([
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
    ])
  })

  it('keeps the default window inside the offered range', () => {
    expect(FORECAST_MIN_DAYS).toBeLessThanOrEqual(FORECAST_DEFAULT_DAYS)
    expect(FORECAST_DEFAULT_DAYS).toBeLessThanOrEqual(FORECAST_MAX_DAYS)
    // Open-Meteo's own ceiling for `forecast_days`.
    expect(FORECAST_MAX_DAYS).toBeLessThanOrEqual(16)
  })

  it('offers exactly the two units the endpoint accepts', () => {
    expect(FORECAST_TEMPERATURE_UNITS).toEqual(['celsius', 'fahrenheit'])
  })

  it('closes the trend vocabulary', () => {
    expect(FORECAST_TRENDS).toEqual(['warming', 'cooling', 'steady'])
  })
})
