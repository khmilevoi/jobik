import { describe, expect, it } from 'vitest'
import { PUBLICATION_IMAGE_HEIGHT, PUBLICATION_IMAGE_WIDTH } from '../types.js'
import { ImageRenderError, imageOut } from './imageOut.js'

const context = { signal: new AbortController().signal, log: () => {} }

const designInput = {
  title: 'Typed flows, quietly',
  markdown: [
    '## Release 0.4',
    'Field-level connections are now',
    'validated against the compiler',
    'output before every run.',
    '',
  ].join('\n'),
}

describe('imageOut', () => {
  it('is a transform definition with two inputs and two outputs', () => {
    expect(imageOut.kind).toBe('transform')
    expect(imageOut.title).toBe('Render image')
    expect(Object.keys(imageOut.input.shape)).toEqual(['title', 'markdown'])
    expect(Object.keys(imageOut.output.shape)).toEqual(['image', 'caption'])
  })

  it('emits a PNG Buffer at the declared dimensions', async () => {
    const result = await imageOut.run(designInput, context)
    expect(result).not.toBeInstanceOf(Error)
    if (result instanceof Error) return
    expect(Buffer.isBuffer(result.image)).toBe(true)
    expect(result.image.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(result.image.readUInt32BE(16)).toBe(PUBLICATION_IMAGE_WIDTH)
    expect(result.image.readUInt32BE(20)).toBe(PUBLICATION_IMAGE_HEIGHT)
  })

  it('emits the caption the Output viewer artboard shows', async () => {
    const result = await imageOut.run(designInput, context)
    if (result instanceof Error) throw result
    expect(result.caption).toBe('Release 0.4 — field-level connections')
  })

  it('is deterministic for the same input', async () => {
    const first = await imageOut.run(designInput, context)
    const second = await imageOut.run(designInput, context)
    if (first instanceof Error || second instanceof Error) throw first
    expect(first.image.equals(second.image)).toBe(true)
  })

  it('produces a different raster for different text', async () => {
    const other = await imageOut.run({ ...designInput, title: 'Something else' }, context)
    const original = await imageOut.run(designInput, context)
    if (other instanceof Error || original instanceof Error) throw other
    expect(other.image.equals(original.image)).toBe(false)
  })

  it('produces output its own schema accepts', async () => {
    const result = await imageOut.run(designInput, context)
    expect(imageOut.output.safeParse(result).success).toBe(true)
  })

  it('returns ImageRenderError for an unsupported inlined colour profile', async () => {
    const result = await imageOut.run(
      {
        title: 'Typed flows, quietly',
        markdown: [
          '## Release 0.4',
          'intro',
          '',
          '![cover](assets/cover.png#profile=display-p3)',
        ].join('\n'),
      },
      context,
    )
    expect(result).toBeInstanceOf(ImageRenderError)
    if (!(result instanceof ImageRenderError)) return
    expect(result._tag).toBe('ImageRenderError')
    expect(result.message).toContain('display-p3')
    expect(result.message).toContain('line 4')
    expect(result.profile).toBe('display-p3')
    expect(result.line).toBe(4)
    expect(typeof result.line).toBe('number')
  })
})
