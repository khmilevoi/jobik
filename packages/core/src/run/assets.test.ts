import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import { asset } from '#asset.js'
import { fieldTypeOf } from '#graph/field-type.js'
import { collectAssets, readAsset, registerAsset } from './assets.js'

describe('registerAsset()', () => {
  it('mints a descriptor whose byte count is the real length, and holds the bytes under its id', () => {
    const data = Buffer.from('hello')
    const descriptor = registerAsset({ data, mime: 'image/png' })

    expect(descriptor.type).toBe('Buffer')
    expect(descriptor.mime).toBe('image/png')
    expect(descriptor.bytes).toBe(5)
    expect(readAsset(descriptor.id)).toEqual({ data, mime: 'image/png' })
  })

  it('gives two registrations of identical bytes two different ids', () => {
    const first = registerAsset({ data: Buffer.from('same'), mime: 'image/png' })
    const second = registerAsset({ data: Buffer.from('same'), mime: 'image/png' })

    expect(first.id).not.toBe(second.id)
  })

  it('copies the bytes it is handed, so a later write by the caller cannot rewrite the asset', () => {
    const shared = Buffer.from([9, 9, 9])
    const descriptor = registerAsset({ data: shared, mime: 'application/octet-stream' })

    shared[0] = 0

    expect([...(readAsset(descriptor.id)?.data ?? [])]).toEqual([9, 9, 9])
  })

  it('copies a view into a pooled buffer, not the pool it points at', () => {
    const pool = Buffer.alloc(8, 7)
    const descriptor = registerAsset({
      data: pool.subarray(0, 4),
      mime: 'application/octet-stream',
    })

    pool.fill(0)

    expect(descriptor.bytes).toBe(4)
    expect([...(readAsset(descriptor.id)?.data ?? [])]).toEqual([7, 7, 7, 7])
  })

  it('accepts any Uint8Array, which is what the asset schema accepts', () => {
    const descriptor = registerAsset({
      data: new Uint8Array([1, 2, 3]),
      mime: 'application/octet-stream',
    })

    expect(descriptor.bytes).toBe(3)
    expect(readAsset(descriptor.id)?.data).toEqual(Buffer.from([1, 2, 3]))
  })
})

describe('readAsset()', () => {
  it('returns null for an id nothing was registered under', () => {
    expect(readAsset('00000000-0000-0000-0000-000000000000')).toBeNull()
  })
})

describe('collectAssets()', () => {
  it('describes every asset field that produced bytes and leaves every other field alone', () => {
    const schema = z.object({ image: asset({ mime: 'image/png' }), caption: z.string() })
    const output = { image: Buffer.from('png bytes'), caption: 'a caption' }

    const descriptors = collectAssets({ schema, output })

    expect(Object.keys(descriptors)).toEqual(['image'])
    expect(descriptors.image.mime).toBe('image/png')
    expect(descriptors.image.bytes).toBe(9)
    expect(readAsset(descriptors.image.id)?.data).toEqual(output.image)
  })

  it('describes nothing when the schema declares no asset field', () => {
    const schema = z.object({ caption: z.string() })

    expect(collectAssets({ schema, output: { caption: 'a caption' } })).toEqual({})
  })

  it('skips an asset field that carries no binary value', () => {
    const schema = z.object({ image: asset({ mime: 'image/png' }) })

    expect(collectAssets({ schema, output: {} })).toEqual({})
  })

  it('describes an optional asset field beside a required one', () => {
    const schema = z.object({
      img: asset({ mime: 'image/png' }).optional(),
      req: asset({ mime: 'image/png' }),
    })
    const output = { img: Buffer.from('optional bytes'), req: Buffer.from('required bytes') }

    const descriptors = collectAssets({ schema, output })

    expect(Object.keys(descriptors).sort()).toEqual(['img', 'req'])
    expect(descriptors.img.mime).toBe('image/png')
    expect(readAsset(descriptors.img.id)?.data).toEqual(output.img)
  })

  it('describes a nullable asset field', () => {
    const schema = z.object({ image: asset({ mime: 'image/jpeg' }).nullable() })
    const output = { image: Buffer.from('jpeg bytes') }

    const descriptors = collectAssets({ schema, output })

    expect(Object.keys(descriptors)).toEqual(['image'])
    expect(descriptors.image.mime).toBe('image/jpeg')
    expect(readAsset(descriptors.image.id)?.data).toEqual(output.image)
  })

  it('describes an asset field carrying a default', () => {
    const schema = z.object({
      image: asset({ mime: 'application/pdf' }).default(() => Buffer.alloc(0)),
    })
    const output = { image: Buffer.from('pdf bytes') }

    const descriptors = collectAssets({ schema, output })

    expect(Object.keys(descriptors)).toEqual(['image'])
    expect(descriptors.image.mime).toBe('application/pdf')
    expect(readAsset(descriptors.image.id)?.data).toEqual(output.image)
  })

  it('describes an asset field wrapped and then described', () => {
    const schema = z.object({ image: asset({ mime: 'image/png' }).optional().describe('the art') })
    const output = { image: Buffer.from('png bytes') }

    const descriptors = collectAssets({ schema, output })

    expect(Object.keys(descriptors)).toEqual(['image'])
    expect(descriptors.image.mime).toBe('image/png')
  })

  it('skips a wrapped asset field whose value is absent or null', () => {
    const schema = z.object({
      missing: asset({ mime: 'image/png' }).optional(),
      empty: asset({ mime: 'image/png' }).nullable(),
    })

    expect(collectAssets({ schema, output: { empty: null } })).toEqual({})
  })

  it('registers exactly the fields `fieldTypeOf` calls an asset', () => {
    const schema = z.object({
      bare: asset({ mime: 'image/png' }),
      optional: asset({ mime: 'image/png' }).optional(),
      nullable: asset({ mime: 'image/png' }).nullable(),
      defaulted: asset({ mime: 'image/png' }).default(() => Buffer.alloc(0)),
      readonlyAsset: asset({ mime: 'image/png' }).readonly(),
      caption: z.string(),
      count: z.number().optional(),
    })
    const bytes = Buffer.from('png bytes')
    const output = {
      bare: bytes,
      optional: bytes,
      nullable: bytes,
      defaulted: bytes,
      readonlyAsset: bytes,
      caption: 'a caption',
      count: 1,
    }

    const byFieldType = Object.entries(schema.shape)
      .filter(([, fieldSchema]) => fieldTypeOf(fieldSchema) === 'asset')
      .map(([field]) => field)

    expect(Object.keys(collectAssets({ schema, output })).sort()).toEqual(byFieldType.sort())
  })
})
