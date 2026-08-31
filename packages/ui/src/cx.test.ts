import { describe, expect, it } from 'vitest'
import { cx } from './cx.js'

describe('cx', () => {
  it('joins the class names it is given with a single space', () => {
    expect(cx('chip', 'accent')).toBe('chip accent')
  })

  it('drops a falsy branch so a conditional variant reads as its condition', () => {
    const tone: string = 'neutral'
    expect(cx('chip', tone === 'accent' && 'chipAccent')).toBe('chip')
    expect(cx('chip', null, undefined, false)).toBe('chip')
  })

  it('drops an undefined class rather than writing "undefined" into the DOM', () => {
    const styles: Record<string, string> = { chip: 'chip' }
    expect(cx(styles.chip, styles.mistyped)).toBe('chip')
  })

  it('drops an empty string so no double space reaches the attribute', () => {
    expect(cx('', 'chip', '')).toBe('chip')
  })

  it('returns an empty string when nothing survives', () => {
    expect(cx()).toBe('')
    expect(cx(undefined, false)).toBe('')
  })
})
