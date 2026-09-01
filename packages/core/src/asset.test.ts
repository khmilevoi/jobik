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

  it('normalises a plain Uint8Array to the Buffer the type promises', () => {
    // A handler returning `new Uint8Array(await res.arrayBuffer())`, `await blob.bytes()` or
    // `crypto.getRandomValues` produces exactly this. Before `.overwrite()`, the predicate let it
    // through untouched and `NodeReport.output` was statically `Buffer` over a value that was not
    // one — `img.toString('base64')` then answered `"1,2,3"` with no type error.
    const parsed = asset({ mime: 'image/png' }).parse(new Uint8Array([1, 2, 3]))
    expect(Buffer.isBuffer(parsed)).toBe(true)
    expect(parsed.toString('base64')).toBe(Buffer.from([1, 2, 3]).toString('base64'))
  })

  it("copies the bytes it normalises rather than viewing the caller's memory", () => {
    const source = new Uint8Array([9, 9, 9])
    const parsed = asset({ mime: 'image/png' }).parse(source)
    source[0] = 0
    expect([...parsed]).toEqual([9, 9, 9])
  })

  it('registers the instance .overwrite() cloned from, not only the clone', () => {
    // `z.toJSONSchema` walks a custom field twice, once per instance, and answers 'throw' on any
    // site it cannot resolve to an asset. Registering only the clone made every asset field in the
    // repository fail to derive with "Custom types cannot be represented in JSON Schema". The
    // registry walks `_zod.parent` child-to-parent, which is the wrong direction to rescue it.
    const image = asset({ mime: 'image/png' })
    const parent = (image as unknown as { _zod: { parent?: z.core.$ZodType } })._zod.parent
    expect(parent).toBeDefined()
    expect(assetMetaOf(parent as z.core.$ZodType)).toEqual({ mime: 'image/png' })
  })

  it('stays a ZodCustom, so every asset consumer still reads the registry off it', () => {
    // `.transform()` would wrap this in a `ZodPipe` and hand `z.toJSONSchema`'s unrepresentable
    // handler the inner transform, which carries no registration. `.overwrite()` does not.
    const image = asset({ mime: 'image/png' })
    expect(image.constructor.name).toBe('ZodCustom')
    expect(assetRegistry.has(image)).toBe(true)
  })

  it('registers its mime in the asset registry', () => {
    const image = asset({ mime: 'image/png' })
    expect(assetRegistry.has(image)).toBe(true)
    expect(assetMetaOf(image)).toEqual({ mime: 'image/png' })
  })

  it('is still found by assetMetaOf after describe(), even though .has() misses it', () => {
    const described = asset({ mime: 'image/png' }).describe('Rendered image')
    expect(assetRegistry.has(described)).toBe(false)
    expect(assetMetaOf(described)).toEqual({ mime: 'image/png' })
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
