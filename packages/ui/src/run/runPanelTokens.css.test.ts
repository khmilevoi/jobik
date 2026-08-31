import * as fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runPanelColors, runPanelMetrics } from './runPanelTokens.js'

/**
 * The parity gate between `runPanelTokens.ts` and `runPanelTokens.css`, modelled on
 * `src/tokens.css.test.ts`.
 *
 * Two files now spell the same values, and nothing in a compiler notices when one of them drifts: a
 * `.module.css` that reads `var(--jbk-run-failed-frame)` keeps compiling after somebody edits
 * `runPanelColors.failedFrame` in TypeScript, and the run panel quietly renders the old colour.
 * `runPanelTokens.ts` remains the source of truth — it is the file whose comments name the artboard
 * line each value came from — so this test is what keeps the stylesheet honest to it.
 *
 * The three values a directory outside `run/` also reads — `actionLabel`, `spinnerTrack` and the
 * load-bearing `failedMeta` — are not here any more. They live in `tokens.ts` and `tokens.css`,
 * because a custom property exists only while its own stylesheet is on the page.
 *
 * Both directions, for the same reasons `tokens.css.test.ts` runs both: left to right catches a
 * token that never reached the stylesheet; right to left catches a custom property invented in CSS
 * with no token behind it.
 */

const RUN_TOKENS_CSS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'runPanelTokens.css')

/**
 * CSS and TypeScript are allowed to disagree on spelling, never on value. Biome formats the
 * stylesheet — `0.25` for `.25`, a space after every comma — while `runPanelTokens.ts` was
 * transcribed from the design file's own shorthand.
 */
function normalize(value: string): string {
  return value
    .replace(/(^|[^\d])\.(\d)/g, (_, before: string, digit: string) => `${before}0.${digit}`)
    .replace(/\s*,\s*/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
}

/** `failedMeta` -> `failed-meta`, `nodeRowPaddingX` -> `node-row-padding-x`. */
function kebab(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

function expectedProperties(): Map<string, string> {
  const expected = new Map<string, string>()
  const add = (values: Readonly<Record<string, string | number>>) => {
    for (const [key, value] of Object.entries(values)) {
      // A metric is a raw number in TypeScript and carries its unit here, so no `.module.css` ever
      // has to add one. A colour, a gradient and a multi-value padding are already strings.
      expected.set(`--jbk-run-${kebab(key)}`, typeof value === 'number' ? `${value}px` : value)
    }
  }
  add(runPanelColors)
  add(runPanelMetrics)
  return expected
}

function declaredProperties(css: string): Map<string, string> {
  const declared = new Map<string, string>()
  for (const match of css.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gm)) {
    declared.set(match[1] as string, (match[2] as string).trim())
  }
  return declared
}

const css = fs.readFileSync(RUN_TOKENS_CSS, 'utf8')
const expected = expectedProperties()
const declared = declaredProperties(css)

describe('runPanelTokens.css', () => {
  it('declares a custom property for every token in runPanelTokens.ts', () => {
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
      .map(([name, value]) => `${name}: ${declared.get(name)} (runPanelTokens.ts says ${value})`)
    expect(drifted).toEqual([])
  })

  it('scopes every declaration to the Studio so a host application is never restyled', () => {
    expect(css).toContain('[data-jobik-studio] {')
    // One block, so nothing can leak out of it by being written after the closing brace.
    expect(css.match(/\{/g)).toHaveLength(1)
  })
})
