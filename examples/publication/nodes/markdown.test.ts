import { describe, expect, it } from 'vitest'
import { markdown } from './markdown.js'

const context = { signal: new AbortController().signal, log: () => {} }

const source = ['## Release 0.4', '', '', 'Field-level connections are now   ', 'validated.'].join(
  '\n',
)

describe('markdown', () => {
  it('is a transform definition with the design inventory title', () => {
    expect(markdown.kind).toBe('transform')
    expect(markdown.title).toBe('Normalise markdown')
  })

  it('declares a single string input and three outputs', () => {
    expect(Object.keys(markdown.input.shape)).toEqual(['markdown'])
    expect(Object.keys(markdown.output.shape)).toEqual(['markdown', 'heading', 'wordCount'])
  })

  it('normalises the source and reports the heading and word count', async () => {
    const result = await markdown.run({ markdown: source }, context)
    expect(result).toEqual({
      markdown: '## Release 0.4\n\nField-level connections are now\nvalidated.\n',
      heading: 'Release 0.4',
      // `Field-level connections are now validated.` — five whitespace-separated words.
      wordCount: 5,
    })
  })

  it('reports an empty heading when the source has none', async () => {
    const result = await markdown.run({ markdown: 'plain prose' }, context)
    expect(result).toEqual({ markdown: 'plain prose\n', heading: '', wordCount: 2 })
  })

  it('produces output its own schema accepts', async () => {
    const result = await markdown.run({ markdown: source }, context)
    expect(markdown.output.safeParse(result).success).toBe(true)
  })
})
