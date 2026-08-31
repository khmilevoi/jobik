import * as fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { studioColors, studioMetrics } from './studioTokens.js'

/**
 * The parity gate between `studioTokens.ts` and `studioTokens.css`, modelled on
 * `src/tokens.css.test.ts`.
 *
 * Two files now spell the same value and no compiler notices when one drifts: a `.module.css`
 * reading `var(--jbk-studio-chip-height)` keeps compiling after somebody edits
 * `studioMetrics.chipHeight`, and the chip quietly renders the old height. Both directions run on
 * purpose — left to right catches a token that never reached the stylesheet, right to left catches
 * a custom property invented in CSS with no token behind it.
 */

const STUDIO_TOKENS_CSS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'studioTokens.css',
)

/**
 * CSS and TypeScript are allowed to disagree on spelling, never on value. Biome formats the
 * stylesheet — `0.3` for `.3`, a space after every comma — while `studioTokens.ts` re-exports
 * `tokens.ts`'s own transcribed shorthand.
 */
function normalize(value: string): string {
  return value
    .replace(/'/g, '"')
    .replace(/(^|[^\d])\.(\d)/g, (_, before: string, digit: string) => `${before}0.${digit}`)
    .replace(/\s*,\s*/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
}

/** `chipSpinnerSize` -> `chip-spinner-size`. */
function kebab(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

function expectedProperties(): Map<string, string> {
  const expected = new Map<string, string>()
  const add = (values: Readonly<Record<string, string | number>>, unit = '') => {
    for (const [key, value] of Object.entries(values)) {
      expected.set(`--jbk-studio-${kebab(key)}`, `${value}${typeof value === 'number' ? unit : ''}`)
    }
  }
  add(studioColors)
  add(studioMetrics, 'px')
  return expected
}

function declaredProperties(css: string): Map<string, string> {
  const declared = new Map<string, string>()
  for (const match of css.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gm)) {
    declared.set(match[1] as string, (match[2] as string).trim())
  }
  return declared
}

const css = fs.readFileSync(STUDIO_TOKENS_CSS, 'utf8')
const expected = expectedProperties()
const declared = declaredProperties(css)

describe('studioTokens.css', () => {
  it('declares a custom property for every token in studioTokens.ts', () => {
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
      .map(([name, value]) => `${name}: ${declared.get(name)} (studioTokens.ts says ${value})`)
    expect(drifted).toEqual([])
  })

  it('scopes every declaration to the Studio so a host application is never restyled', () => {
    expect(css).toContain('[data-jobik-studio] {')
    // One block, so nothing can leak out of it by being written after the closing brace.
    expect(css.match(/\{/g)).toHaveLength(1)
  })
})
