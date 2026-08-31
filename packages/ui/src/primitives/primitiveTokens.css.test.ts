import * as fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { primitiveColors, primitiveMetrics } from './primitiveTokens.js'

/**
 * The parity gate between `primitiveTokens.ts` and `primitiveTokens.css`, modelled on
 * `../output/outputTokens.css.test.ts`. Same reasoning: a `primitives/*.module.css` reads
 * `var(--jbk-primitive-…)`, and nothing in a compiler notices when that property and the token
 * behind it drift apart.
 *
 * `primitiveColors` and `primitiveMetrics` share no key, so one flat `--jbk-primitive-*` prefix is
 * enough. Every metric is a pixel length — there is no unitless ratio here.
 */

const PRIMITIVE_TOKENS_CSS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'primitiveTokens.css',
)

/** Same normalisation `tokens.css.test.ts` uses: spelling may differ, value may not. */
function normalize(value: string): string {
  return value
    .replace(/'/g, '"')
    .replace(/(^|[^\d])\.(\d)/g, (_, before: string, digit: string) => `${before}0.${digit}`)
    .replace(/\s*,\s*/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
}

/** `okBorderSoft` -> `ok-border-soft`. */
function kebab(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

function expectedProperties(): Map<string, string> {
  const expected = new Map<string, string>()
  for (const [key, value] of Object.entries(primitiveColors)) {
    expected.set(`--jbk-primitive-${kebab(key)}`, value)
  }
  for (const [key, value] of Object.entries(primitiveMetrics)) {
    expected.set(`--jbk-primitive-${kebab(key)}`, `${value}px`)
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

const css = fs.readFileSync(PRIMITIVE_TOKENS_CSS, 'utf8')
const expected = expectedProperties()
const declared = declaredProperties(css)

describe('primitiveTokens.css', () => {
  it('declares a custom property for every token in primitiveTokens.ts', () => {
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
      .map(([name, value]) => `${name}: ${declared.get(name)} (primitiveTokens.ts says ${value})`)
    expect(drifted).toEqual([])
  })

  it('scopes every declaration to the Studio so a host application is never restyled', () => {
    expect(css).toContain('[data-jobik-studio] {')
    // One block, so nothing can leak out of it by being written after the closing brace.
    expect(css.match(/\{/g)).toHaveLength(1)
  })
})
