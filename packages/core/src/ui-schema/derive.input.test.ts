import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import { JobUiSchemaError } from '../errors.js'
import { deriveInputControls } from './derive.js'

const derive = (input: z.ZodObject) => deriveInputControls({ nodeId: 'render', input })

const fieldsOf = (input: z.ZodObject) => {
  const descriptor = derive(input)
  if (descriptor instanceof Error) throw descriptor
  return descriptor.fields
}

describe('deriveInputControls() — native controls', () => {
  it('derives a string control with its constraints', () => {
    expect(fieldsOf(z.object({ title: z.string().min(2).max(9) }))).toStrictEqual([
      {
        field: 'title',
        required: true,
        annotation: 'string',
        control: { kind: 'string', minLength: 2, maxLength: 9 },
      },
    ])
  })

  it('carries a string format', () => {
    expect(fieldsOf(z.object({ site: z.url() }))[0]?.control).toStrictEqual({
      kind: 'string',
      format: 'uri',
    })
  })

  it('derives a number control and flags an integer', () => {
    expect(
      fieldsOf(z.object({ ratio: z.number(), count: z.number().int().min(1).max(10) })),
    ).toStrictEqual([
      {
        field: 'ratio',
        required: true,
        annotation: 'number',
        control: { kind: 'number', integer: false },
      },
      {
        field: 'count',
        required: true,
        annotation: 'number',
        control: { kind: 'number', integer: true, minimum: 1, maximum: 10 },
      },
    ])
  })

  it('derives a boolean control', () => {
    expect(fieldsOf(z.object({ draft: z.boolean() }))).toStrictEqual([
      { field: 'draft', required: true, annotation: 'boolean', control: { kind: 'boolean' } },
    ])
  })

  it('derives an enum control for string and numeric enums', () => {
    expect(fieldsOf(z.object({ mode: z.enum(['fast', 'slow']) }))[0]?.control).toStrictEqual({
      kind: 'enum',
      options: ['fast', 'slow'],
    })
    expect(fieldsOf(z.object({ level: z.enum({ A: 1, B: 2 }) }))[0]?.control).toStrictEqual({
      kind: 'enum',
      options: [1, 2],
    })
  })

  it('derives a literal control, including a null literal', () => {
    expect(fieldsOf(z.object({ tag: z.literal('only') }))[0]?.control).toStrictEqual({
      kind: 'literal',
      value: 'only',
    })
    expect(fieldsOf(z.object({ nothing: z.literal(null) }))[0]?.control).toStrictEqual({
      kind: 'literal',
      value: null,
    })
  })

  it('marks an optional field not required', () => {
    expect(fieldsOf(z.object({ note: z.string().optional() }))).toStrictEqual([
      { field: 'note', required: false, annotation: 'string', control: { kind: 'string' } },
    ])
  })

  it('carries a default and, under io input, does not require the field', () => {
    expect(fieldsOf(z.object({ greeting: z.string().default('hello') }))).toStrictEqual([
      {
        field: 'greeting',
        required: false,
        annotation: 'string',
        default: 'hello',
        control: { kind: 'string' },
      },
    ])
  })

  it('carries describe() as a description and meta title as a title and annotation', () => {
    expect(fieldsOf(z.object({ body: z.string().describe('The body') }))[0]?.description).toBe(
      'The body',
    )
    const titled = fieldsOf(z.object({ id: z.string().meta({ title: 'FlowId' }) }))[0]
    expect(titled?.title).toBe('FlowId')
    expect(titled?.annotation).toBe('FlowId')
  })

  it('keeps the schema field order and returns no fields for an empty schema', () => {
    expect(fieldsOf(z.object({ b: z.string(), a: z.string() })).map((f) => f.field)).toStrictEqual([
      'b',
      'a',
    ])
    expect(derive(z.object({}))).toStrictEqual({ nodeId: 'render', fields: [] })
  })
})

describe('deriveInputControls() — JobUiSchemaError', () => {
  it('returns the error as a value, never throws it', () => {
    const result = derive(z.object({ when: z.date() }))
    expect(result).toBeInstanceOf(JobUiSchemaError)
  })

  it('names the node, the field, the io side and the reason with its pointer', () => {
    const result = derive(z.object({ when: z.date() }))
    if (!(result instanceof JobUiSchemaError)) throw new Error('expected a JobUiSchemaError')

    expect(result._tag).toBe('JobUiSchemaError')
    expect(result.io).toBe('input')
    expect(result.field).toBe('when')
    expect(result.reason).toBe('Date cannot be represented in JSON Schema at #/properties/when')
    expect(result.message).toContain('field when of node render')
    expect(result.cause).toBeInstanceOf(Error)
  })

  it('rejects every type the spec names, and an unregistered custom schema', () => {
    expect(derive(z.object({ when: z.date() }))).toBeInstanceOf(JobUiSchemaError)
    expect(derive(z.object({ lookup: z.map(z.string(), z.string()) }))).toBeInstanceOf(
      JobUiSchemaError,
    )
    expect(derive(z.object({ big: z.bigint() }))).toBeInstanceOf(JobUiSchemaError)
    expect(derive(z.object({ unique: z.set(z.string()) }))).toBeInstanceOf(JobUiSchemaError)
    expect(
      derive(z.object({ blob: z.custom<Buffer>((value) => value instanceof Uint8Array) })),
    ).toBeInstanceOf(JobUiSchemaError)
  })

  it('reports a nested field by its dotted path', () => {
    const result = derive(z.object({ meta: z.object({ created: z.date() }) }))
    if (!(result instanceof JobUiSchemaError)) throw new Error('expected a JobUiSchemaError')
    expect(result.field).toBe('meta.created')
    expect(result.reason).toContain('#/properties/meta/properties/created')
  })

  it('reports a field inside an array by the field that holds it', () => {
    const result = derive(z.object({ days: z.array(z.date()) }))
    if (!(result instanceof JobUiSchemaError)) throw new Error('expected a JobUiSchemaError')
    expect(result.field).toBe('days')
    expect(result.reason).toContain('#/properties/days/items')
  })
})
