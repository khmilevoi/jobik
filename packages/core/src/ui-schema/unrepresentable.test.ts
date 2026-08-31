import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import { type AssetDescriptor, asset } from '#asset.js'
import {
  assetExtensionKey,
  assetJsonSchema,
  assetMimeOf,
  createAssetUnrepresentableHandler,
  fieldPathOf,
  jsonPointerOf,
} from './unrepresentable.js'

describe('assetJsonSchema()', () => {
  it('is the descriptor schema the spec prints, with title Buffer and x-jobik-asset', () => {
    expect(assetJsonSchema({ mime: 'image/png' })).toStrictEqual({
      type: 'object',
      title: 'Buffer',
      properties: {
        type: { const: 'Buffer' },
        mime: { const: 'image/png' },
        bytes: { type: 'integer' },
        id: { type: 'string' },
      },
      required: ['type', 'mime', 'bytes', 'id'],
      'x-jobik-asset': { mime: 'image/png' },
    })
  })

  it('requires exactly the four fields AssetDescriptor carries', () => {
    const descriptor: AssetDescriptor = { type: 'Buffer', mime: 'image/png', bytes: 1, id: 'a' }
    expect(assetJsonSchema({ mime: 'image/png' }).required).toStrictEqual(Object.keys(descriptor))
  })

  it('names the extension key once', () => {
    expect(assetExtensionKey).toBe('x-jobik-asset')
  })
})

describe('createAssetUnrepresentableHandler()', () => {
  it('resolves a registered asset field and records no site', () => {
    const unrepresentable = createAssetUnrepresentableHandler()
    const json = z.toJSONSchema(z.object({ image: asset({ mime: 'image/png' }) }), {
      io: 'output',
      unrepresentable: unrepresentable.handler,
    })

    expect(json.properties?.image).toStrictEqual(assetJsonSchema({ mime: 'image/png' }))
    expect(unrepresentable.site()).toBeUndefined()
  })

  it('resolves an asset through optional() and describe() wrappers', () => {
    const unrepresentable = createAssetUnrepresentableHandler()
    const json = z.toJSONSchema(
      z.object({
        maybe: asset({ mime: 'image/jpeg' }).optional(),
        described: asset({ mime: 'image/gif' }).describe('a gif'),
      }),
      { io: 'output', unrepresentable: unrepresentable.handler },
    )

    expect(json.properties?.maybe).toStrictEqual(assetJsonSchema({ mime: 'image/jpeg' }))
    expect(json.properties?.described).toStrictEqual({
      ...assetJsonSchema({ mime: 'image/gif' }),
      description: 'a gif',
    })
    expect(unrepresentable.site()).toBeUndefined()
  })

  it('records the first non-asset site and makes toJSONSchema throw', () => {
    const unrepresentable = createAssetUnrepresentableHandler()

    expect(() =>
      z.toJSONSchema(z.object({ when: z.date() }), {
        io: 'input',
        unrepresentable: unrepresentable.handler,
      }),
    ).toThrow('Date cannot be represented in JSON Schema')

    expect(unrepresentable.site()).toStrictEqual({
      path: ['properties', 'when'],
      message: 'Date cannot be represented in JSON Schema',
    })
  })

  it('records a nested site with its full pointer path', () => {
    const unrepresentable = createAssetUnrepresentableHandler()

    expect(() =>
      z.toJSONSchema(z.object({ a: z.object({ b: z.map(z.string(), z.string()) }) }), {
        io: 'input',
        unrepresentable: unrepresentable.handler,
      }),
    ).toThrow()

    expect(unrepresentable.site()?.path).toStrictEqual(['properties', 'a', 'properties', 'b'])
  })

  it('rejects an unregistered custom schema, which is what makes the registry the gate', () => {
    const unrepresentable = createAssetUnrepresentableHandler()

    expect(() =>
      z.toJSONSchema(z.object({ blob: z.custom<Buffer>((value) => value instanceof Uint8Array) }), {
        io: 'output',
        unrepresentable: unrepresentable.handler,
      }),
    ).toThrow('Custom types cannot be represented in JSON Schema')

    expect(unrepresentable.site()?.message).toBe(
      'Custom types cannot be represented in JSON Schema',
    )
  })
})

describe('fieldPathOf()', () => {
  it('names the dotted field path a pointer path walks', () => {
    expect(fieldPathOf(['properties', 'image'])).toBe('image')
    expect(fieldPathOf(['properties', 'a', 'properties', 'b'])).toBe('a.b')
    expect(fieldPathOf(['properties', 'list', 'items'])).toBe('list')
    expect(fieldPathOf(['properties', 'either', 'anyOf', 1])).toBe('either')
  })

  it('does not mistake a field literally named properties for a marker', () => {
    expect(fieldPathOf(['properties', 'properties', 'properties', 'x'])).toBe('properties.x')
  })

  it('calls the empty path the root', () => {
    expect(fieldPathOf([])).toBe('(root)')
  })
})

describe('jsonPointerOf()', () => {
  it('writes an RFC 6901 pointer', () => {
    expect(jsonPointerOf(['properties', 'a', 'items'])).toBe('#/properties/a/items')
    expect(jsonPointerOf(['properties', 'either', 'anyOf', 1])).toBe('#/properties/either/anyOf/1')
  })

  it('escapes ~ and / inside a segment', () => {
    expect(jsonPointerOf(['properties', 'a/b~c'])).toBe('#/properties/a~1b~0c')
  })

  it('writes the root as #', () => {
    expect(jsonPointerOf([])).toBe('#')
  })
})

describe('assetMimeOf()', () => {
  it('reads the mime an x-jobik-asset marker carries', () => {
    expect(assetMimeOf({ type: 'object', 'x-jobik-asset': { mime: 'image/png' } })).toBe(
      'image/png',
    )
  })

  it('is undefined for a fragment with no marker, or a malformed one', () => {
    expect(assetMimeOf({ type: 'string' })).toBeUndefined()
    expect(assetMimeOf({ 'x-jobik-asset': 'image/png' })).toBeUndefined()
    expect(assetMimeOf({ 'x-jobik-asset': { mime: 7 } })).toBeUndefined()
  })
})
