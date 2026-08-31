import * as fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { outputColors, outputMetrics } from './outputTokens.js'

/**
 * The parity gate between `outputTokens.ts` and `outputTokens.css`, modelled on
 * `../tokens.css.test.ts`. Same reasoning: an `output/*.module.css` reads
 * `var(--jbk-output-…)`, and nothing in a compiler notices when that property and the token
 * behind it drift apart.
 *
 * `outputColors` and `outputMetrics` share no key, so — unlike `tokens.ts` — this module needs
 * only one flat `--jbk-output-*` prefix rather than a group per object. Every `outputMetrics`
 * value is a pixel length except the three line-height ratios, which stay unitless.
 */

const OUTPUT_TOKENS_CSS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'outputTokens.css',
)

const UNITLESS_METRICS = new Set(['rawLineHeight', 'logLineHeight', 'emptyVariantLineHeight'])

/** Same normalisation `tokens.css.test.ts` uses: spelling may differ, value may not. */
function normalize(value: string): string {
  return value
    .replace(/'/g, '"')
    .replace(/(^|[^\d])\.(\d)/g, (_, before: string, digit: string) => `${before}0.${digit}`)
    .replace(/\s*,\s*/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
}

/** `badgeScrim` -> `badge-scrim`. */
function kebab(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

function expectedProperties(): Map<string, string> {
  const expected = new Map<string, string>()
  for (const [key, value] of Object.entries(outputColors)) {
    expected.set(`--jbk-output-${kebab(key)}`, value)
  }
  for (const [key, value] of Object.entries(outputMetrics)) {
    const unit = UNITLESS_METRICS.has(key) ? '' : 'px'
    expected.set(`--jbk-output-${kebab(key)}`, `${value}${unit}`)
  }
  return expected
}

function declaredProperties(css: string): Map<string, string> {
  const declared = new Map<string, string>()
  for (const match of css.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gm)) {
    declared.set(match[1] as string, (match[2] as string).trim())
  }
  return declared
}

const css = fs.readFileSync(OUTPUT_TOKENS_CSS, 'utf8')
const expected = expectedProperties()
const declared = declaredProperties(css)

describe('outputTokens.css', () => {
  it('declares a custom property for every token in outputTokens.ts', () => {
    const missing = [...expected.keys()].filter((name) => !declared.has(name))
    expect(missing).toEqual([])
  })

  it('declares no custom property that no token backs', () => {
    const extra = [...declared.keys()].filter((name) => !expected.has(name))
    expect(extra).toEqual([])
  })

  it('gives every custom property the value its token carries', () => {
    const drifted = [...expected]
      .filter(([name, value]) => normalize(declared.get(name) ?? '') !== normalize(value))
      .map(([name, value]) => `${name}: ${declared.get(name)} (outputTokens.ts says ${value})`)
    expect(drifted).toEqual([])
  })

  it('scopes every declaration to the Studio so a host application is never restyled', () => {
    expect(css).toContain('[data-jobik-studio] {')
    // One block, so nothing can leak out of it by being written after the closing brace.
    expect(css.match(/\{/g)).toHaveLength(1)
  })
})
