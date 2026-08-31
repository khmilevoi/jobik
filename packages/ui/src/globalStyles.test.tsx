import * as fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { STUDIO_GLOBAL_CSS, StudioStyles } from './globalStyles.js'

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

  it('keeps the keyframe names the motion tokens reference', () => {
    const stylesheet = fs.readFileSync(path.join(SRC, 'globalStyles.css'), 'utf8')
    for (const name of ['jspin', 'jdash', 'jshim', 'jpulse']) {
      expect(stylesheet).toContain(`@keyframes ${name}`)
    }
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
