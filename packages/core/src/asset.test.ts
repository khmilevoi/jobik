import { describe, expect, expectTypeOf, it } from 'vitest'
import * as z from 'zod'
import { type AssetDescriptor, asset, assetMetaOf, assetRegistry } from './asset.js'

describe('asset()', () => {
  it('accepts a Buffer and any Uint8Array', () => {
    const image = asset({ mime: 'image/png' })
    expect(image.safeParse(Buffer.from('png')).success).toBe(true)
    expect(image.safeParse(new Uint8Array([1, 2, 3])).success).toBe(true)
  })

  it('rejects values that are not binary', () => {
    const image = asset({ mime: 'image/png' })
    expect(image.safeParse('not binary').success).toBe(false)
    expect(image.safeParse(654336).success).toBe(false)
    expect(image.safeParse(undefined).success).toBe(false)
  })

  it('keeps a Buffer unchanged through validation', () => {
    const bytes = Buffer.from('png')
    const parsed = asset({ mime: 'image/png' }).parse(bytes)
    expect(parsed).toBe(bytes)
  })

  it('registers its mime in the asset registry', () => {
    const image = asset({ mime: 'image/png' })
    expect(assetRegistry.has(image)).toBe(true)
    expect(assetMetaOf(image)).toEqual({ mime: 'image/png' })
  })

  it('registers each call independently', () => {
    const png = asset({ mime: 'image/png' })
    const pdf = asset({ mime: 'application/pdf' })
    expect(assetMetaOf(png)?.mime).toBe('image/png')
    expect(assetMetaOf(pdf)?.mime).toBe('application/pdf')
  })

  it('is recognisable through an object shape', () => {
    const output = z.object({ image: asset({ mime: 'image/png' }), caption: z.string() })
    expect(assetMetaOf(output.shape.image)?.mime).toBe('image/png')
    expect(assetMetaOf(output.shape.caption)).toBeUndefined()
  })

  it('infers Buffer as its parsed type', () => {
    expectTypeOf<z.output<ReturnType<typeof asset>>>().toEqualTypeOf<Buffer>()
  })
})

describe('AssetDescriptor', () => {
  it('is the four-field wire shape the server sends instead of bytes', () => {
    const descriptor: AssetDescriptor = {
      type: 'Buffer',
      mime: 'image/png',
      bytes: 654336,
      id: 'a1b2c3',
    }
    expect(descriptor).toEqual({ type: 'Buffer', mime: 'image/png', bytes: 654336, id: 'a1b2c3' })
  })

  it('pins `type` to the literal Buffer', () => {
    // @ts-expect-error `type` is the literal 'Buffer', not an arbitrary string
    const wrong: AssetDescriptor = { type: 'Blob', mime: 'image/png', bytes: 1, id: 'a' }
    expect(wrong.type).toBe('Blob')
  })
})
