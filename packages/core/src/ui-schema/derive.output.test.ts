import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import { asset } from '#asset.js'
import { JobUiSchemaError } from '#errors.js'
import { deriveOutputFields } from './derive.js'

const derive = (output: z.ZodObject) => deriveOutputFields({ nodeId: 'render', output })

const fieldsOf = (output: z.ZodObject) => {
  const descriptor = derive(output)
  if (descriptor instanceof Error) throw descriptor
  return descriptor.fields
}

describe('deriveOutputFields()', () => {
  it('annotates the design render node: a caption string beside a Buffer', () => {
    expect(
      fieldsOf(z.object({ image: asset({ mime: 'image/png' }), caption: z.string() })),
    ).toStrictEqual([
      {
        field: 'image',
        required: true,
        annotation: 'Buffer',
        title: 'Buffer',
        asset: { mime: 'image/png' },
      },
      { field: 'caption', required: true, annotation: 'string' },
    ])
  })

  it('carries no control, because outputs are not edited', () => {
    expect(fieldsOf(z.object({ caption: z.string() }))[0]).not.toHaveProperty('control')
  })

  it('annotates the remaining JSON types', () => {
    const fields = fieldsOf(
      z.object({
        count: z.number().int(),
        ok: z.boolean(),
        meta: z.object({ a: z.string() }),
        tags: z.array(z.string()),
      }),
    )
    expect(fields.map((field) => field.annotation)).toStrictEqual([
      'number',
      'boolean',
      'object',
      'array',
    ])
  })

  it('marks an optional output not required and keeps a defaulted one required', () => {
    const fields = fieldsOf(z.object({ note: z.string().optional(), tag: z.string().default('x') }))
    expect(fields.map((field) => [field.field, field.required])).toStrictEqual([
      ['note', false],
      ['tag', true],
    ])
  })

  it('carries a description', () => {
    expect(fieldsOf(z.object({ caption: z.string().describe('Alt text') }))[0]?.description).toBe(
      'Alt text',
    )
  })

  it('returns JobUiSchemaError as a value for an output that cannot be represented', () => {
    const result = derive(z.object({ finishedAt: z.date() }))
    if (!(result instanceof JobUiSchemaError)) throw new Error('expected a JobUiSchemaError')

    expect(result.io).toBe('output')
    expect(result.field).toBe('finishedAt')
    expect(result.reason).toBe(
      'Date cannot be represented in JSON Schema at #/properties/finishedAt',
    )
  })

  it('never fails on an asset field, which is the whole point of the callback', () => {
    expect(derive(z.object({ image: asset({ mime: 'image/png' }) }))).not.toBeInstanceOf(Error)
  })
})

describe('deriveOutputFields() — a non-array required from a node author meta()', () => {
  it('does not throw, and treats a field as not required', () => {
    const result = derive(z.object({ a: z.string() }).meta({ required: 5 }))
    if (result instanceof Error) throw result
    expect(result.fields).toStrictEqual([{ field: 'a', required: false, annotation: 'string' }])
  })
})

describe('deriveOutputFields() — a malformed properties map from a node author meta()', () => {
  it('does not throw on a non-object properties value, and returns no fields', () => {
    const result = derive(z.object({ a: z.string() }).meta({ properties: 'abc' }))
    if (result instanceof Error) throw result
    expect(result.fields).toStrictEqual([])
  })

  it('does not throw on a non-object property entry, and returns no fields', () => {
    const result = derive(z.object({ a: z.string() }).meta({ properties: { a: 5 } }))
    if (result instanceof Error) throw result
    expect(result.fields).toStrictEqual([])
  })
})
