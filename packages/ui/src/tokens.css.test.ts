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

const SRC = path.dirname(fileURLToPath(import.meta.url))
const TOKENS_CSS = path.join(SRC, 'tokens.css')
const GLOBAL_STYLES_CSS = path.join(SRC, 'globalStyles.css')

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

/**
 * The `@media (prefers-reduced-motion: reduce)` block of `globalStyles.css`, as a property map.
 *
 * `declaredProperties` is deliberately reused: the block is a plain declaration list like the
 * `:root`-equivalent one, so the same parser reads it and the two sides stay comparable. The slice
 * ends at the first `\n}` in column zero, which is the `@media`'s own closing brace — the inner
 * `[data-jobik-studio] { … }` closes indented and cannot terminate it early.
 */
function reducedMotionProperties(globalCss: string): Map<string, string> {
  const block = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/.exec(globalCss)
  if (block === null) throw new Error('globalStyles.css declares no prefers-reduced-motion block')
  return declaredProperties(block[1] as string)
}

/** Every `@keyframes` name `globalStyles.css` defines. */
function keyframeNames(globalCss: string): string[] {
  return [...globalCss.matchAll(/@keyframes\s+([A-Za-z0-9_-]+)/g)].map((m) => m[1] as string)
}

/**
 * Every `<name>Tokens.css` beside a directory barrel, plus `tokens.css` itself. These are the only
 * stylesheets allowed to state a design value; a `*.module.css` is covered by
 * `cssModuleValues.test.ts`, which bans a literal outright.
 */
function tokenStylesheets(): string[] {
  const files = [TOKENS_CSS]
  for (const entry of fs.readdirSync(SRC, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = path.join(SRC, entry.name)
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('Tokens.css')) files.push(path.join(dir, name))
    }
  }
  return files
}

const css = fs.readFileSync(TOKENS_CSS, 'utf8')
const globalCss = fs.readFileSync(GLOBAL_STYLES_CSS, 'utf8')
const expected = expectedProperties()
const declared = declaredProperties(css)
const reduced = reducedMotionProperties(globalCss)
const keyframes = keyframeNames(globalCss)

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

/**
 * The reduced-motion gate, which is the wiring half of the parity gate above.
 *
 * The three tests over `tokens.css` prove that a value *agrees* across two files. They say nothing
 * about whether a motion token is *reached* by `globalStyles.css`'s
 * `@media (prefers-reduced-motion: reduce)` block — that block hand-enumerates its properties, and
 * a ninth motion token added to `tokens.ts` would agree with `tokens.css`, satisfy the raw-literal
 * gate and the class-usage gate, and still animate for a user who asked the operating system for
 * no animation. `4A`'s rule 04 is not an aspiration ("every duration here becomes 0 except the
 * spinner"), so it gets a gate that closes over the whole `motion` group rather than over the list
 * somebody last remembered to extend.
 *
 * Three obligations, derived rather than listed:
 *
 * - a `duration*` key must be redefined to `0ms`;
 * - any other key is a keyframe shorthand and must be redefined to `none`;
 * - an `ease*` key must **not** be redefined, because a curve over zero time is not observable.
 *
 * `spinner` is the single exception and it is declared, not inferred: `4A:15` mandates it, since
 * `jspin` is the only signal that a run is in progress and stopping it removes information rather
 * than motion. Adding a second exception is therefore a deliberate edit to this map, which is the
 * point.
 */
const REDUCED_MOTION_EXCEPTIONS = new Map<string, string>([
  ['spinner', '`4A:15` — the only signal that a run is in progress'],
  ['easeSettle', 'a curve over zero time is not observable'],
  ['easeExit', 'a curve over zero time is not observable'],
  ['easeLinear', 'a curve over zero time is not observable'],
])

describe('prefers-reduced-motion', () => {
  it('redefines every motion token, except the ones it declares an exception', () => {
    const escaped = Object.keys(motion)
      .filter((key) => !REDUCED_MOTION_EXCEPTIONS.has(key))
      .map((key) => {
        const name = `--jbk-motion-${kebab(key)}`
        const want = key.startsWith('duration') ? '0ms' : 'none'
        const got = reduced.get(name)
        return got === want ? '' : `${name}: ${got ?? '(not redefined)'} — expected ${want}`
      })
      .filter((message) => message !== '')
    expect(escaped).toEqual([])
  })

  it('leaves the excepted tokens alone', () => {
    const overreach = [...REDUCED_MOTION_EXCEPTIONS]
      .filter(([key]) => reduced.has(`--jbk-motion-${kebab(key)}`))
      .map(([key, why]) => `--jbk-motion-${kebab(key)} is redefined, but ${why}`)
    expect(overreach).toEqual([])
  })

  it('redefines nothing that is not a token', () => {
    const foreign = [...reduced.keys()].filter((name) => !expected.has(name))
    expect(foreign).toEqual([])
  })

  /**
   * The class, not the instance. A token stylesheet that inlines a keyframe name or a raw duration
   * has written motion the block above cannot reach, however well `tokens.ts` and its `.css` twin
   * agree about it. The one sanctioned way for a directory to carry motion is to point at the
   * `motion` group — `var(--jbk-motion-…)` — so redefining that token redefines this one too.
   */
  it('leaves no token stylesheet carrying motion the block cannot reach', () => {
    const time = /(^|[\s(,/])\d*\.?\d+m?s(\s|$|[),;])/
    const unreachable: string[] = []
    for (const file of tokenStylesheets()) {
      const sheet = fs.readFileSync(file, 'utf8')
      for (const [name, value] of declaredProperties(sheet)) {
        // The `motion` group is what the block redefines; the tests above cover it in full.
        if (name.startsWith('--jbk-motion-')) continue
        if (value.includes('var(--jbk-motion-')) continue
        const names = keyframes.filter((frame) => new RegExp(`\\b${frame}\\b`).test(value))
        if (names.length === 0 && !time.test(value)) continue
        unreachable.push(`${path.relative(SRC, file)} — ${name}: ${value}`)
      }
    }
    expect(unreachable).toEqual([])
  })
})
