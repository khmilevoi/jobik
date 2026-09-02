import * as fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { STUDIO_GLOBAL_CSS, StudioStyles } from './globalStyles.js'
import { motion } from './tokens.js'

afterEach(cleanup)

const SRC = path.dirname(fileURLToPath(import.meta.url))

/**
 * Whitespace, a trailing semicolon and a leading zero are the formatter's business, not the
 * stylesheet's. Biome formats `globalStyles.css`; `STUDIO_GLOBAL_CSS` was transcribed minified.
 */
function minify(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, '')
    .replace(/;\}/g, '}')
    .replace(/(^|[^\d])\.(\d)/g, (_, before: string, digit: string) => `${before}0.${digit}`)
}

describe('STUDIO_GLOBAL_CSS', () => {
  it('declares the four motion loops the design uses', () => {
    expect(STUDIO_GLOBAL_CSS).toContain('@keyframes jspin{to{transform:rotate(360deg)}}')
    expect(STUDIO_GLOBAL_CSS).toContain('@keyframes jdash{to{stroke-dashoffset:-24}}')
    expect(STUDIO_GLOBAL_CSS).toContain(
      '@keyframes jshim{0%{background-position:130% 0}100%{background-position:-30% 0}}',
    )
    expect(STUDIO_GLOBAL_CSS).toContain('@keyframes jpulse{0%,100%{opacity:.4}50%{opacity:1}}')
    // Artboard `3D` added these two. `jsweep` is the validating button's 2px bar; `jpop` is the
    // result chip arriving, and the only non-loop animation in the design.
    expect(STUDIO_GLOBAL_CSS).toContain(
      '@keyframes jsweep{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}',
    )
    expect(STUDIO_GLOBAL_CSS).toContain(
      '@keyframes jpop{from{opacity:0;transform:translateY(2px) scale(.97)}to{opacity:1;transform:none}}',
    )
  })

  it('scopes the box-sizing reset to the Studio', () => {
    expect(STUDIO_GLOBAL_CSS).toContain('[data-jobik-studio],[data-jobik-studio] *')
    expect(STUDIO_GLOBAL_CSS).toContain('box-sizing:border-box')
  })

  it('resets the button font family without touching its line height', () => {
    expect(STUDIO_GLOBAL_CSS).toContain('[data-jobik-studio] button')
    expect(STUDIO_GLOBAL_CSS).toContain('font-family:inherit')
    expect(STUDIO_GLOBAL_CSS).not.toContain('line-height')
  })
})

describe('globalStyles.css', () => {
  /**
   * The reset now exists twice: as a stylesheet a bundler emits and as the string the `<style>`
   * element renders. Two spellings of one rule set is the failure this whole migration is trying
   * to avoid, so the only thing that makes the pair safe is a test that fails when they diverge.
   */
  it('says exactly what STUDIO_GLOBAL_CSS says', () => {
    const stylesheet = fs.readFileSync(path.join(SRC, 'globalStyles.css'), 'utf8')
    expect(minify(stylesheet)).toBe(minify(STUDIO_GLOBAL_CSS))
  })

  /**
   * The keyframe names are the join between two files that no compiler checks: `tokens.ts` writes
   * `jfade 90ms linear` into a token, and this stylesheet is where `jfade` is defined. Rename one
   * side and the animation stops with nothing red.
   *
   * A hand-written list of names is the wrong guard for that, because it is only as good as the
   * last person's memory — this one sat at six names while the design added two, so renaming
   * `jfade` would have killed the swap fade in six components and `jline` the log-line entrance,
   * with the gate green. So the list is derived from both sides instead and compared as a set: a
   * keyframe defined here and referenced by no token fails, and a token naming a keyframe this
   * file does not define fails. Neither direction can be forgotten into.
   */
  it('defines exactly the keyframes the motion tokens name', () => {
    const stylesheet = fs.readFileSync(path.join(SRC, 'globalStyles.css'), 'utf8')
    const defined = [...stylesheet.matchAll(/@keyframes\s+([A-Za-z0-9_-]+)/g)].map(
      (match) => match[1] as string,
    )
    // A duration or a curve names no keyframe; every other motion token is an animation shorthand
    // whose first word is the name.
    const referenced = Object.entries(motion)
      .filter(([key]) => !key.startsWith('duration') && !key.startsWith('ease'))
      .map(([, value]) => value.trim().split(/\s+/)[0] as string)
    expect([...new Set(defined)].sort()).toEqual([...new Set(referenced)].sort())
  })
})

describe('StudioStyles', () => {
  it('renders the css into a single style element', () => {
    const { container } = render(<StudioStyles />)
    const styles = container.querySelectorAll('style[data-jobik-styles]')
    expect(styles).toHaveLength(1)
    expect(styles[0]?.textContent).toBe(STUDIO_GLOBAL_CSS)
  })
})
