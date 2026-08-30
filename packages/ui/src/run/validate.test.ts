import type { InputFieldDescriptor } from '@jobik/core'
import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import { collectRunInputValues, toRunInputIssues, validateRunInputs } from './validate.js'

const stringField = (field: string, required = true): InputFieldDescriptor => ({
  field,
  required,
  annotation: 'string',
  control: { kind: 'string' },
})

describe('collectRunInputValues', () => {
  it('passes a string control through unchanged', () => {
    const values = collectRunInputValues([stringField('title')], { title: 'Typed flows, quietly' })
    expect(values).toEqual({ title: 'Typed flows, quietly' })
  })

  it('turns a number control back into a number', () => {
    const field: InputFieldDescriptor = {
      field: 'width',
      required: true,
      annotation: 'number',
      control: { kind: 'number', integer: true },
    }
    expect(collectRunInputValues([field], { width: '1024' })).toEqual({ width: 1024 })
  })

  it('keeps a boolean control a boolean', () => {
    const field: InputFieldDescriptor = {
      field: 'draft',
      required: true,
      annotation: 'boolean',
      control: { kind: 'boolean' },
    }
    expect(collectRunInputValues([field], { draft: true })).toEqual({ draft: true })
  })

  it('uses a literal value rather than anything the draft holds', () => {
    const field: InputFieldDescriptor = {
      field: 'kind',
      required: true,
      annotation: 'string',
      control: { kind: 'literal', value: 'article' },
    }
    expect(collectRunInputValues([field], { kind: 'tampered' })).toEqual({ kind: 'article' })
  })

  it('omits an asset field, which is never a form control', () => {
    const field: InputFieldDescriptor = {
      field: 'cover',
      required: true,
      annotation: 'Buffer',
      control: { kind: 'asset', mime: 'image/png' },
    }
    expect(collectRunInputValues([field], { cover: 'anything' })).toEqual({})
  })

  it('omits an optional field left empty, so the schema default applies', () => {
    const fields = [stringField('title'), stringField('subtitle', false)]
    expect(collectRunInputValues(fields, { title: 'a', subtitle: '' })).toEqual({ title: 'a' })
  })

  it('omits a field the draft has no entry for at all', () => {
    expect(collectRunInputValues([stringField('title')], {})).toEqual({})
  })

  it('keeps a required field empty so the schema reports it rather than the form', () => {
    expect(collectRunInputValues([stringField('title')], { title: '' })).toEqual({ title: '' })
  })

  it('parses a json control into a value', () => {
    const field: InputFieldDescriptor = {
      field: 'meta',
      required: true,
      annotation: 'object',
      control: { kind: 'json', schema: { type: 'object' } },
    }
    expect(collectRunInputValues([field], { meta: '{"tags":["a"]}' })).toEqual({
      meta: { tags: ['a'] },
    })
  })

  it('returns the SyntaxError of an unparsable json control, naming the field', () => {
    const field: InputFieldDescriptor = {
      field: 'meta',
      required: true,
      annotation: 'object',
      control: { kind: 'json', schema: { type: 'object' } },
    }
    const result = collectRunInputValues([field], { meta: '{oops' })
    expect(result).toBeInstanceOf(SyntaxError)
    expect((result as SyntaxError).message).toContain('meta')
    expect((result as SyntaxError).cause).toBeInstanceOf(Error)
  })

  it('collects a numeric enum by round-tripping the string draft back to the number option', () => {
    const field: InputFieldDescriptor = {
      field: 'status',
      required: true,
      annotation: 'number',
      control: { kind: 'enum', options: [1, 2] },
    }
    expect(collectRunInputValues([field], { status: '1' })).toEqual({ status: 1 })
  })

  it('keeps a string enum as a string after round-trip matching', () => {
    const field: InputFieldDescriptor = {
      field: 'speed',
      required: true,
      annotation: 'string',
      control: { kind: 'enum', options: ['fast', 'slow'] },
    }
    expect(collectRunInputValues([field], { speed: 'fast' })).toEqual({ speed: 'fast' })
  })

  it('passes through an enum value that matches no option, so the schema can reject it', () => {
    const field: InputFieldDescriptor = {
      field: 'speed',
      required: true,
      annotation: 'string',
      control: { kind: 'enum', options: ['fast', 'slow'] },
    }
    expect(collectRunInputValues([field], { speed: 'invalid' })).toEqual({ speed: 'invalid' })
  })

  it('collects a boolean as false when the draft has no entry for it at all', () => {
    const field: InputFieldDescriptor = {
      field: 'draft',
      required: true,
      annotation: 'boolean',
      control: { kind: 'boolean' },
    }
    expect(collectRunInputValues([field], {})).toEqual({ draft: false })
  })
})

describe('validateRunInputs', () => {
  const input = z.object({ title: z.string().min(1), count: z.number() })
  const fields: readonly InputFieldDescriptor[] = [
    stringField('title'),
    {
      field: 'count',
      required: true,
      annotation: 'number',
      control: { kind: 'number', integer: true },
    },
  ]

  it('returns the parsed values when the draft satisfies the schema', () => {
    const result = validateRunInputs({ input, fields, draft: { title: 'a', count: '3' } })
    expect(result).toEqual({ title: 'a', count: 3 })
  })

  it('returns the ZodError when it does not, and never throws', () => {
    const result = validateRunInputs({ input, fields, draft: { title: '', count: '3' } })
    expect(result).toBeInstanceOf(Error)
    expect(toRunInputIssues(result as Error)[0]?.path).toBe('title')
  })

  it('returns the SyntaxError from the collect step without reaching the schema', () => {
    const jsonFields: readonly InputFieldDescriptor[] = [
      {
        field: 'meta',
        required: true,
        annotation: 'object',
        control: { kind: 'json', schema: { type: 'object' } },
      },
    ]
    const result = validateRunInputs({
      input: z.object({ meta: z.object({}) }),
      fields: jsonFields,
      draft: { meta: 'nope' },
    })
    expect(result).toBeInstanceOf(SyntaxError)
  })

  it('collects and validates a numeric enum from a string draft', () => {
    const numericEnumInput = z.object({ status: z.enum({ A: 1, B: 2 }) })
    const numericEnumFields: readonly InputFieldDescriptor[] = [
      {
        field: 'status',
        required: true,
        annotation: 'number',
        control: { kind: 'enum', options: [1, 2] },
      },
    ]
    const result = validateRunInputs({
      input: numericEnumInput,
      fields: numericEnumFields,
      draft: { status: '1' },
    })
    expect(result).toEqual({ status: 1 })
  })

  it('collects and validates a string enum from a string draft', () => {
    const stringEnumInput = z.object({ speed: z.enum(['fast', 'slow'] as const) })
    const stringEnumFields: readonly InputFieldDescriptor[] = [
      {
        field: 'speed',
        required: true,
        annotation: 'string',
        control: { kind: 'enum', options: ['fast', 'slow'] },
      },
    ]
    const result = validateRunInputs({
      input: stringEnumInput,
      fields: stringEnumFields,
      draft: { speed: 'fast' },
    })
    expect(result).toEqual({ speed: 'fast' })
  })

  it('returns a ZodError when an enum draft value does not match any option', () => {
    const stringEnumInput = z.object({ speed: z.enum(['fast', 'slow'] as const) })
    const stringEnumFields: readonly InputFieldDescriptor[] = [
      {
        field: 'speed',
        required: true,
        annotation: 'string',
        control: { kind: 'enum', options: ['fast', 'slow'] },
      },
    ]
    const result = validateRunInputs({
      input: stringEnumInput,
      fields: stringEnumFields,
      draft: { speed: 'invalid' },
    })
    expect(result).toBeInstanceOf(Error)
    expect(toRunInputIssues(result as Error)[0]?.path).toBe('speed')
  })

  it('collects a required boolean as false and passes safeParse when the draft has no entry', () => {
    const booleanInput = z.object({ draft: z.boolean() })
    const booleanFields: readonly InputFieldDescriptor[] = [
      {
        field: 'draft',
        required: true,
        annotation: 'boolean',
        control: { kind: 'boolean' },
      },
    ]
    const result = validateRunInputs({ input: booleanInput, fields: booleanFields, draft: {} })
    expect(result).toEqual({ draft: false })
  })
})

describe('toRunInputIssues', () => {
  it('flattens a ZodError into path and message pairs', () => {
    const input = z.object({ nested: z.object({ depth: z.number() }) })
    const result = validateRunInputs({
      input,
      fields: [
        {
          field: 'nested',
          required: true,
          annotation: 'object',
          control: { kind: 'json', schema: { type: 'object' } },
        },
      ],
      draft: { nested: '{"depth":"deep"}' },
    })
    const issues = toRunInputIssues(result as Error)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.path).toBe('nested.depth')
    expect(typeof issues[0]?.message).toBe('string')
  })

  it('reports any other error as a single pathless issue', () => {
    const issues = toRunInputIssues(new SyntaxError('meta: Unexpected token o'))
    expect(issues).toEqual([{ path: '', message: 'meta: Unexpected token o' }])
  })
})
