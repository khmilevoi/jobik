import * as fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  accent,
  accentAlternates,
  borders,
  fontFamilies,
  fontWeights,
  kindDotColors,
  layout,
  motion,
  radii,
  scrollbar,
  statusColors,
  surfaces,
  textColors,
  tracking,
  typeScale,
} from './tokens.js'

/**
 * The parity gate between `tokens.ts` and `tokens.css`.
 *
 * Two files now spell the same hex value, and nothing in a compiler notices when one of them
 * drifts: a `.module.css` that reads `var(--jbk-surface-panel)` keeps compiling after somebody
 * edits `surfaces.panel` in TypeScript, and the Studio quietly renders the old colour. This test
 * is the only thing standing between the migration and two sources of truth.
 *
 * It runs both directions on purpose. Left to right catches a token that never reached the
 * stylesheet; right to left catches a custom property somebody invented in CSS with no token
 * behind it — the same "do not invent a value" rule the raw-literal gate enforces inside
 * `*.module.css`, applied one level up.
 */

const TOKENS_CSS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tokens.css')

/**
 * CSS and TypeScript are allowed to disagree on spelling, never on value. Biome formats the
 * stylesheet — double quotes, `0.6` for `.6`, a space after every comma — while `tokens.ts` was
 * transcribed from the design file's own shorthand. Normalising both sides keeps the test about
 * the value rather than about whose formatter ran last.
 */
function normalize(value: string): string {
  return value
    .replace(/'/g, '"')
    .replace(/(^|[^\d])\.(\d)/g, (_, before: string, digit: string) => `${before}0.${digit}`)
    .replace(/\s*,\s*/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
}

/** `topBar` -> `top-bar`. The whole naming convention, in one line. */
function kebab(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

function expectedProperties(): Map<string, string> {
  const expected = new Map<string, string>()

  const add = (group: string, values: Readonly<Record<string, string | number>>, unit = '') => {
    for (const [key, value] of Object.entries(values)) {
      expected.set(
        `--jbk-${group}-${kebab(key)}`,
        `${value}${typeof value === 'number' ? unit : ''}`,
      )
    }
  }

  add('surface', surfaces)
  add('border', borders)
  add('text', textColors)
  add('status', statusColors)
  add('kind-dot', kindDotColors)
  add('font', fontFamilies)
  add('weight', fontWeights)
  add('tracking', tracking)
  add('motion', motion)
  add('radius', radii, 'px')
  add('layout', layout, 'px')
  // Mixed on purpose: the two colours carry no unit, the two lengths take `px` like every other
  // numeric token, so `.module.css` and `globalStyles.css` never add a unit themselves.
  add('scrollbar', scrollbar, 'px')

  // `accent.cssVar` is the override point rather than a value of its own, so it takes the bare
  // name. Everything else in the group follows the convention.
  for (const [key, value] of Object.entries(accent)) {
    expected.set(key === 'cssVar' ? '--jbk-accent' : `--jbk-accent-${kebab(key)}`, value)
  }
  accentAlternates.forEach((value, index) => {
    expected.set(`--jbk-accent-alt-${index + 1}`, value)
  })

  // The scale is keyed by its own value: `12.5px` is `--jbk-size-12-5`.
  for (const size of typeScale) {
    expected.set(`--jbk-size-${String(size).replace('.', '-')}`, `${size}px`)
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

const css = fs.readFileSync(TOKENS_CSS, 'utf8')
const expected = expectedProperties()
const declared = declaredProperties(css)

describe('tokens.css', () => {
  it('declares a custom property for every token in tokens.ts', () => {
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
      .map(([name, value]) => `${name}: ${declared.get(name)} (tokens.ts says ${value})`)
    expect(drifted).toEqual([])
  })

  it('scopes every declaration to the Studio so a host application is never restyled', () => {
    expect(css).toContain('[data-jobik-studio] {')
    // One block, so nothing can leak out of it by being written after the closing brace.
    expect(css.match(/\{/g)).toHaveLength(1)
  })

  it('keeps the frame override point that accent.cssVar promises', () => {
    expect(declared.get('--jbk-accent')).toBe('var(--accent, #1fd6bd)')
  })

  it('keeps the two colours that are the sole mark of a state exactly', () => {
    // The `#4a5157` cached dot and the `#6d5f5c` failed run meta are the only thing distinguishing
    // those states. An approximation is a silent design regression nothing else would catch, and
    // both are read from two directories, which is why they live here rather than beside one.
    expect(declared.get('--jbk-kind-dot-cached')).toBe(kindDotColors.cached)
    expect(kindDotColors.cached).toBe('#4a5157')
    expect(declared.get('--jbk-text-failed-meta')).toBe(textColors.failedMeta)
    expect(textColors.failedMeta).toBe('#6d5f5c')
  })
})
