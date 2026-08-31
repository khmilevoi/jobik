import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import { asset } from '#asset.js'
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
})
