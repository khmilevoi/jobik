import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import { asset } from '#asset.js'
import { JobUiSchemaError } from '#errors.js'
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

describe('deriveInputControls() — asset and JSON controls', () => {
  it('derives an asset control, annotated Buffer, and never an editable one', () => {
    expect(fieldsOf(z.object({ image: asset({ mime: 'image/png' }) }))).toStrictEqual([
      {
        field: 'image',
        required: true,
        annotation: 'Buffer',
        title: 'Buffer',
        control: { kind: 'asset', mime: 'image/png' },
      },
    ])
  })

  it('derives a JSON control for a nested object, keeping the fragment verbatim', () => {
    expect(fieldsOf(z.object({ meta: z.object({ a: z.string() }) }))).toStrictEqual([
      {
        field: 'meta',
        required: true,
        annotation: 'object',
        control: {
          kind: 'json',
          schema: { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] },
        },
      },
    ])
  })

  it('derives a JSON control for an array', () => {
    expect(fieldsOf(z.object({ tags: z.array(z.string()) }))[0]).toStrictEqual({
      field: 'tags',
      required: true,
      annotation: 'array',
      control: { kind: 'json', schema: { type: 'array', items: { type: 'string' } } },
    })
  })

  it('derives a JSON control for a union, a record and a tuple', () => {
    const fields = fieldsOf(
      z.object({
        either: z.union([z.string(), z.number()]),
        bag: z.record(z.string(), z.number()),
        pair: z.tuple([z.string(), z.number()]),
      }),
    )
    expect(fields.map((field) => field.control.kind)).toStrictEqual(['json', 'json', 'json'])
    expect(fields.map((field) => field.annotation)).toStrictEqual([
      'string | number',
      'object',
      'array',
    ])
  })

  it('annotates a shape with no type at all as unknown', () => {
    const fields = fieldsOf(
      z.object({
        choice: z.discriminatedUnion('t', [
          z.object({ t: z.literal('a'), x: z.string() }),
          z.object({ t: z.literal('b'), y: z.number() }),
        ]),
      }),
    )
    expect(fields[0]?.annotation).toBe('unknown')
    expect(fields[0]?.control.kind).toBe('json')
  })

  it('carries the root $defs a recursive schema produces, so its $ref resolves', () => {
    // Zod v4's recursive-schema pattern: a getter that names the schema being defined. If
    // TypeScript reports a circular self-reference here, annotate `branch` as `z.ZodType` instead
    // and pass `branch as z.ZodObject` below — the runtime schema is identical either way.
    const branch: z.ZodObject = z.object({
      name: z.string(),
      get children() {
        return z.array(branch)
      },
    })
    const descriptor = derive(z.object({ tree: branch }))
    if (descriptor instanceof Error) throw descriptor

    expect(descriptor.fields[0]?.control).toStrictEqual({
      kind: 'json',
      schema: { $ref: '#/$defs/__schema0' },
    })
    expect(Object.keys(descriptor.$defs ?? {})).toStrictEqual(['__schema0'])
  })

  it('omits $defs when the schema needs none', () => {
    expect(derive(z.object({ title: z.string() }))).toStrictEqual({
      nodeId: 'render',
      fields: [
        { field: 'title', required: true, annotation: 'string', control: { kind: 'string' } },
      ],
    })
  })

  it('emits { $ref: "#" } with no $defs for a root self-reference', () => {
    const Node: z.ZodObject = z.object({
      name: z.string(),
      get parent() {
        return Node.optional()
      },
    })
    const descriptor = derive(Node)
    if (descriptor instanceof Error) throw descriptor

    expect(descriptor.fields.find((field) => field.field === 'parent')?.control).toStrictEqual({
      kind: 'json',
      schema: { $ref: '#' },
    })
    expect(descriptor.$defs).toBeUndefined()
  })
})

describe('deriveInputControls() — a non-array required from a node author meta()', () => {
  it('does not throw, and treats a field as not required', () => {
    const result = derive(z.object({ a: z.string() }).meta({ required: 5 }))
    if (result instanceof Error) throw result
    expect(result.fields).toStrictEqual([
      { field: 'a', required: false, annotation: 'string', control: { kind: 'string' } },
    ])
  })
})

describe('deriveInputControls() — a malformed properties map from a node author meta()', () => {
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
