import * as fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { canvasColors, canvasMetrics } from './canvasTokens.js'

/**
 * The parity gate between `canvasTokens.ts` and `canvasTokens.css`, modelled on `tokens.css.test.ts`.
 *
 * The same argument applies one directory down: two files now spell the same hex, and nothing in a
 * compiler notices when one drifts. A `.module.css` reading `var(--jbk-canvas-failed-border)` keeps
 * compiling after somebody edits `canvasColors.failedBorder`, and the canvas quietly paints the old
 * colour. Both directions run on purpose — left to right catches a token that never reached the
 * stylesheet, right to left catches a property invented in CSS with no token behind it.
 *
 * Nothing is exempt, including the values only JavaScript reads today (`nodeWidth`, the dot-grid
 * metrics). An exemption list is a hole, and three unused custom properties cost less than one.
 */

const CANVAS_TOKENS_CSS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'canvasTokens.css',
)

/** Biome formats the stylesheet; `canvasTokens.ts` was transcribed from the design file's own
 *  shorthand. Normalising both sides keeps the test about the value. */
function normalize(value: string): string {
  return value
    .replace(/'/g, '"')
    .replace(/(^|[^\d])\.(\d)/g, (_, before: string, digit: string) => `${before}0.${digit}`)
    .replace(/\s*,\s*/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
}

/** `dotGrid` -> `dot-grid`. */
function kebab(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

/** The one ratio in `canvasMetrics`. Every other number is a length and carries `px`. */
const UNITLESS = new Set(['cachedOpacity'])

function flatten(prefix: string, group: object, into: Map<string, string>): void {
  for (const [key, value] of Object.entries(group)) {
    const name = `${prefix}-${kebab(key)}`
    if (typeof value === 'object' && value !== null) {
      flatten(name, value, into)
      continue
    }
    into.set(name, typeof value === 'number' && !UNITLESS.has(key) ? `${value}px` : String(value))
  }
}

function expectedProperties(): Map<string, string> {
  const expected = new Map<string, string>()
  flatten('--jbk-canvas', canvasColors, expected)
  flatten('--jbk-canvas', canvasMetrics, expected)
  return expected
}

function declaredProperties(css: string): Map<string, string> {
  const declared = new Map<string, string>()
  for (const match of css.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gm)) {
    declared.set(match[1] as string, (match[2] as string).trim())
  }
  return declared
}

const css = fs.readFileSync(CANVAS_TOKENS_CSS, 'utf8')
const expected = expectedProperties()
const declared = declaredProperties(css)

describe('canvasTokens.css', () => {
  it('finds the tokens to check', () => {
    expect(expected.size).toBeGreaterThan(0)
  })

  it('declares a custom property for every token in canvasTokens.ts', () => {
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
      .map(([name, value]) => `${name}: ${declared.get(name)} (canvasTokens.ts says ${value})`)
    expect(drifted).toEqual([])
  })

  it('keeps the cached kind dot distinguishable, which is the only thing that marks a cached node', () => {
    expect(declared.get('--jbk-canvas-annotation-dim')).toBe('#4a5157')
  })

  it('scopes every declaration to the Studio so a host application is never restyled', () => {
    expect(css).toContain('[data-jobik-studio] {')
    // One block, so nothing can leak out of it by being written after the closing brace.
    expect(css.match(/\{/g)).toHaveLength(1)
  })
})
