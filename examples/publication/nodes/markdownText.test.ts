import { describe, expect, it } from 'vitest'
import {
  bodyOf,
  captionFor,
  headingOf,
  normaliseMarkdown,
  unsupportedColourProfile,
  wordCountOf,
} from './markdownText.js'

const designMarkdown = [
  '## Release 0.4',
  'Field-level connections are now',
  'validated against the compiler',
  'output before every run.',
  '',
].join('\n')

describe('headingOf()', () => {
  it('returns the text of the first ATX heading', () => {
    expect(headingOf(designMarkdown)).toBe('Release 0.4')
    expect(headingOf('# Title\n\nbody')).toBe('Title')
    expect(headingOf('###### Deep\n')).toBe('Deep')
  })

  it('strips closing hashes and surrounding space', () => {
    expect(headingOf('##   Spaced heading   ##\n')).toBe('Spaced heading')
  })

  it('returns undefined when there is no heading', () => {
    expect(headingOf('just prose\nover two lines')).toBeUndefined()
  })
})

describe('bodyOf()', () => {
  it('returns everything after the heading, without leading blank lines', () => {
    expect(bodyOf(designMarkdown)).toBe(
      'Field-level connections are now\nvalidated against the compiler\noutput before every run.',
    )
  })

  it('returns the whole source when there is no heading', () => {
    expect(bodyOf('  just prose\n')).toBe('just prose')
  })

  it('returns an empty string for a heading with no body', () => {
    expect(bodyOf('## Only a heading\n')).toBe('')
  })
})

describe('captionFor()', () => {
  it('reproduces the caption the Output viewer artboard shows', () => {
    expect(captionFor({ title: 'Typed flows, quietly', markdown: designMarkdown })).toBe(
      'Release 0.4 — field-level connections',
    )
  })

  it('falls back to the title when the markdown has no heading', () => {
    expect(captionFor({ title: 'Untitled', markdown: 'Field-level connections are now' })).toBe(
      'Untitled — field-level connections',
    )
  })

  it('omits the summary when there is no body', () => {
    expect(captionFor({ title: 'Untitled', markdown: '## Only a heading' })).toBe('Only a heading')
  })
})

describe('normaliseMarkdown()', () => {
  it('trims trailing whitespace, collapses blank runs and ends with one newline', () => {
    expect(normaliseMarkdown('# A   \n\n\n\nb\t\n')).toBe('# A\n\nb\n')
  })

  it('is idempotent', () => {
    const once = normaliseMarkdown(designMarkdown)
    expect(normaliseMarkdown(once)).toBe(once)
  })
})

describe('wordCountOf()', () => {
  it('counts whitespace-separated words', () => {
    expect(wordCountOf(bodyOf(designMarkdown))).toBe(12)
    expect(wordCountOf('')).toBe(0)
    expect(wordCountOf('   \n  ')).toBe(0)
  })
})

describe('unsupportedColourProfile()', () => {
  it('finds the first inlined asset whose declared profile is not sRGB', () => {
    const source = [
      '## Release 0.4',
      'intro',
      '',
      '![cover](assets/cover.png#profile=display-p3)',
    ].join('\n')
    expect(unsupportedColourProfile(source)).toEqual({ profile: 'display-p3', line: 4 })
  })

  it('accepts srgb and assets that declare no profile', () => {
    expect(unsupportedColourProfile('![a](a.png#profile=srgb)')).toBeUndefined()
    expect(unsupportedColourProfile('![a](a.png)')).toBeUndefined()
    expect(unsupportedColourProfile(designMarkdown)).toBeUndefined()
  })
})
