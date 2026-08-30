import type { NodeInputDescriptor } from '@jobik/core'
import { describe, expect, it } from 'vitest'
import { collectRunInputValues } from '../run/index.js'
import { initialRunInputDraft, runInputPresentation, toRunInputSchema } from './inputSchema.js'

const DESCRIPTOR: NodeInputDescriptor = {
  nodeId: 'start1',
  fields: [
    { field: 'title', required: true, annotation: 'string', control: { kind: 'string' } },
    { field: 'markdown', required: true, annotation: 'string', control: { kind: 'string' } },
    {
      field: 'quality',
      required: false,
      annotation: 'number | undefined',
      default: 90,
      control: { kind: 'number', integer: true, minimum: 1, maximum: 100 },
    },
    {
      field: 'draft',
      required: false,
      annotation: 'boolean | undefined',
      default: true,
      control: { kind: 'boolean' },
    },
    {
      field: 'size',
      required: true,
      annotation: "'sm' | 'lg'",
      control: { kind: 'enum', options: ['sm', 'lg'] },
    },
    {
      field: 'kind',
      required: true,
      annotation: "'post'",
      control: { kind: 'literal', value: 'post' },
    },
    {
      field: 'meta',
      required: false,
      annotation: 'object | undefined',
      control: { kind: 'json', schema: { type: 'object' } },
    },
    {
      field: 'logo',
      required: false,
      annotation: 'Buffer | undefined',
      control: { kind: 'asset', mime: 'image/png' },
    },
  ],
}

describe('toRunInputSchema', () => {
  it('accepts what collectRunInputValues produces from the initial draft', () => {
    const draft = { ...initialRunInputDraft(DESCRIPTOR), title: 'A post', markdown: '# Hello' }
    const values = collectRunInputValues(DESCRIPTOR.fields, draft)

    expect(values).not.toBeInstanceOf(Error)
    if (values instanceof Error) return
    expect(toRunInputSchema(DESCRIPTOR).safeParse(values).success).toBe(true)
  })

  it('rejects a missing required string', () => {
    const schema = toRunInputSchema(DESCRIPTOR)

    expect(schema.safeParse({ title: '', markdown: 'x', size: 'sm', kind: 'post' }).success).toBe(
      true,
    )
    expect(schema.safeParse({ markdown: 'x', size: 'sm', kind: 'post' }).success).toBe(false)
  })

  it('rejects a number outside the descriptor bounds and a non-integer', () => {
    const base = { title: 't', markdown: 'm', size: 'sm', kind: 'post' }
    const schema = toRunInputSchema(DESCRIPTOR)

    expect(schema.safeParse({ ...base, quality: 101 }).success).toBe(false)
    expect(schema.safeParse({ ...base, quality: 90.5 }).success).toBe(false)
    expect(schema.safeParse({ ...base, quality: 90 }).success).toBe(true)
  })

  it('rejects an option the enum does not declare', () => {
    const base = { title: 't', markdown: 'm', kind: 'post' }
    const schema = toRunInputSchema(DESCRIPTOR)

    expect(schema.safeParse({ ...base, size: 'xl' }).success).toBe(false)
    expect(schema.safeParse({ ...base, size: 'lg' }).success).toBe(true)
  })

  it('pins a literal control to its value', () => {
    const base = { title: 't', markdown: 'm', size: 'sm' }
    const schema = toRunInputSchema(DESCRIPTOR)

    expect(schema.safeParse({ ...base, kind: 'page' }).success).toBe(false)
    expect(schema.safeParse({ ...base, kind: 'post' }).success).toBe(true)
  })

  it('omits asset fields entirely, because collectRunInputValues omits them', () => {
    const schema = toRunInputSchema(DESCRIPTOR)

    expect(Object.keys(schema.shape)).not.toContain('logo')
  })

  it('accepts anything for a json control and leaves validation to the server', () => {
    const base = { title: 't', markdown: 'm', size: 'sm', kind: 'post' }
    const schema = toRunInputSchema(DESCRIPTOR)

    expect(schema.safeParse({ ...base, meta: { any: ['thing'] } }).success).toBe(true)
  })

  it('never rejects an optional field left empty by collectRunInputValues (never stricter than the server)', () => {
    const base = { title: 't', markdown: 'm', size: 'sm', kind: 'post' }
    const schema = toRunInputSchema(DESCRIPTOR)

    // quality and draft are optional and, when the draft leaves them untouched,
    // collectRunInputValues omits them entirely rather than sending '' or false.
    expect(schema.safeParse(base).success).toBe(true)
  })

  it('never rejects a boolean value collectRunInputValues can actually produce', () => {
    const base = { title: 't', markdown: 'm', size: 'sm', kind: 'post' }
    const schema = toRunInputSchema(DESCRIPTOR)

    expect(schema.safeParse({ ...base, draft: false }).success).toBe(true)
    expect(schema.safeParse({ ...base, draft: true }).success).toBe(true)
  })
})

describe('initialRunInputDraft', () => {
  it('seeds a boolean control from its declared default', () => {
    expect(initialRunInputDraft(DESCRIPTOR).draft).toBe(true)
  })

  it('seeds a number from its default, as a string the DOM can hold', () => {
    expect(initialRunInputDraft(DESCRIPTOR).quality).toBe('90')
  })

  it('seeds a required enum with no default from its first option, matching what the select renders', () => {
    expect(initialRunInputDraft(DESCRIPTOR).size).toBe('sm')
  })

  it('seeds a literal control with its fixed value', () => {
    expect(initialRunInputDraft(DESCRIPTOR).kind).toBe('post')
  })

  it('leaves a field with no default empty', () => {
    expect(initialRunInputDraft(DESCRIPTOR).title).toBe('')
    expect(initialRunInputDraft(DESCRIPTOR).markdown).toBe('')
  })

  it('does not seed an asset control', () => {
    expect(initialRunInputDraft(DESCRIPTOR).logo).toBeUndefined()
  })

  it('returns a draft the synthesised schema accepts whole', () => {
    const draft = initialRunInputDraft(DESCRIPTOR)

    expect(draft).toEqual({
      title: '',
      markdown: '',
      quality: '90',
      draft: true,
      size: 'sm',
      kind: 'post',
      meta: '',
    })
  })
})

describe('runInputPresentation', () => {
  it('always makes a json control an area', () => {
    const presentation = runInputPresentation(DESCRIPTOR, initialRunInputDraft(DESCRIPTOR))

    expect(presentation.meta).toBe('area')
  })

  it('makes a short single-line string a line', () => {
    const presentation = runInputPresentation(DESCRIPTOR, {
      ...initialRunInputDraft(DESCRIPTOR),
      title: 'A short title',
    })

    expect(presentation.title).toBe('line')
  })

  it('makes a multi-line or long string an area', () => {
    const presentation = runInputPresentation(DESCRIPTOR, {
      ...initialRunInputDraft(DESCRIPTOR),
      markdown: '# Heading\n\nBody text.',
    })

    expect(presentation.markdown).toBe('area')
  })

  it('makes a non-string control a line regardless of its draft value', () => {
    const presentation = runInputPresentation(DESCRIPTOR, initialRunInputDraft(DESCRIPTOR))

    expect(presentation.size).toBe('line')
    expect(presentation.draft).toBe('line')
    expect(presentation.quality).toBe('line')
    expect(presentation.kind).toBe('line')
  })
})
