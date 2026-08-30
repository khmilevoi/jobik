import { describe, expect, it } from 'vitest'
import { PUBLICATION_CDN_BASE } from '../types.js'
import { httpSink } from './httpSink.js'

const context = { signal: new AbortController().signal }
const image = Buffer.from('a fake png payload')

describe('httpSink', () => {
  it('is a sink definition with two inputs and one output', () => {
    expect(httpSink.kind).toBe('sink')
    expect(httpSink.title).toBe('Publish image')
    expect(Object.keys(httpSink.input.shape)).toEqual(['image', 'caption'])
    expect(Object.keys(httpSink.output.shape)).toEqual(['url'])
  })

  it('returns a URL in the shape the Output viewer artboard shows', async () => {
    const result = await httpSink.run({ image, caption: 'Release 0.4' }, context)
    if (result instanceof Error) throw result
    expect(result.url).toMatch(
      new RegExp(`^${PUBLICATION_CDN_BASE.replaceAll('.', '\\.')}/[0-9a-f]{12}/cover\\.png$`),
    )
  })

  it('is deterministic and content-addressed', async () => {
    const first = await httpSink.run({ image, caption: 'Release 0.4' }, context)
    const same = await httpSink.run({ image, caption: 'Release 0.4' }, context)
    const other = await httpSink.run({ image, caption: 'Release 0.5' }, context)
    if (first instanceof Error || same instanceof Error || other instanceof Error) throw first
    expect(same.url).toBe(first.url)
    expect(other.url).not.toBe(first.url)
  })

  it('produces output its own schema accepts', async () => {
    const result = await httpSink.run({ image, caption: 'Release 0.4' }, context)
    expect(httpSink.output.safeParse(result).success).toBe(true)
  })

  it('accepts the binary field its schema declares', () => {
    expect(httpSink.input.safeParse({ image, caption: 'x' }).success).toBe(true)
    expect(httpSink.input.safeParse({ image: 'not binary', caption: 'x' }).success).toBe(false)
  })

  it('prevents digest collisions from delimiter injection', async () => {
    // Collision pair from the review: the old implementation would produce the same digest
    // for these two cases because it concatenated without length prefixes
    const image1 = Buffer.from([0x41])
    const caption1 = '\nB'

    const image2 = Buffer.from([0x41, 0x0a])
    const caption2 = 'B'

    const result1 = await httpSink.run({ image: image1, caption: caption1 }, context)
    const result2 = await httpSink.run({ image: image2, caption: caption2 }, context)

    if (result1 instanceof Error || result2 instanceof Error) throw result1

    // With proper length-prefixing, these should produce different URLs
    expect(result1.url).not.toBe(result2.url)
  })
})
