import { readFile } from 'node:fs/promises'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type {
  ControlDescriptor,
  InputFieldDescriptor,
  JsonSchemaFragment,
  NodeInputDescriptor,
  NodeOutputDescriptor,
  OutputFieldDescriptor,
} from './descriptor.js'

describe('descriptor module', () => {
  it('has no import and no runtime export, so it cannot carry Node code to the browser', async () => {
    const source = await readFile(new URL('./descriptor.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/^import\b/m)
    expect(source).not.toMatch(/^export (?!type )/m)
  })
})

describe('ControlDescriptor', () => {
  it('discriminates on kind', () => {
    const controls: ControlDescriptor[] = [
      { kind: 'string', format: 'email', minLength: 2, maxLength: 9, pattern: '^a+$' },
      { kind: 'number', integer: true, minimum: 1, maximum: 10 },
      { kind: 'boolean' },
      { kind: 'enum', options: ['fast', 'slow'] },
      { kind: 'literal', value: null },
      { kind: 'asset', mime: 'image/png' },
      { kind: 'json', schema: { type: 'object', properties: { a: { type: 'string' } } } },
    ]
    expect(controls.map((control) => control.kind)).toEqual([
      'string',
      'number',
      'boolean',
      'enum',
      'literal',
      'asset',
      'json',
    ])
  })

  it('narrows a json control to its fragment', () => {
    const control: ControlDescriptor = { kind: 'json', schema: { type: 'array' } }
    if (control.kind !== 'json') throw new Error('unreachable')
    expectTypeOf(control.schema).toEqualTypeOf<JsonSchemaFragment>()
  })

  it('refuses a Zod schema, a function or an undefined inside a json fragment', () => {
    // @ts-expect-error a descriptor is JSON: a function is not a JsonValue
    const withFunction: ControlDescriptor = { kind: 'json', schema: { fn: () => 1 } }
    // @ts-expect-error a descriptor is JSON: undefined is not a JsonValue
    const withUndefined: ControlDescriptor = { kind: 'json', schema: { nope: undefined } }
    expect([withFunction.kind, withUndefined.kind]).toEqual(['json', 'json'])
  })
})

describe('field descriptors', () => {
  it('describes one input field with its annotation, control and default', () => {
    const field: InputFieldDescriptor = {
      field: 'markdown',
      required: true,
      annotation: 'string',
      description: 'The body',
      default: '# title',
      control: { kind: 'string' },
    }
    expect(JSON.parse(JSON.stringify(field))).toStrictEqual(field)
  })

  it('describes one output field and marks a binary one', () => {
    const field: OutputFieldDescriptor = {
      field: 'image',
      required: true,
      annotation: 'Buffer',
      asset: { mime: 'image/png' },
    }
    expect(JSON.parse(JSON.stringify(field))).toStrictEqual(field)
  })

  it('gives an output field no control, because outputs are not edited', () => {
    const field: OutputFieldDescriptor = {
      field: 'image',
      required: true,
      annotation: 'Buffer',
      // @ts-expect-error outputs carry an annotation, never a control
      control: { kind: 'asset', mime: 'image/png' },
    }
    expect(field.field).toBe('image')
  })
})

describe('node descriptors', () => {
  it('carries the node id, its fields and the root $defs', () => {
    const input: NodeInputDescriptor = {
      nodeId: 'render',
      fields: [
        { field: 'markdown', required: true, annotation: 'string', control: { kind: 'string' } },
      ],
      $defs: { __schema0: { type: 'object' } },
    }
    const output: NodeOutputDescriptor = {
      nodeId: 'render',
      fields: [{ field: 'caption', required: true, annotation: 'string' }],
    }
    expect(JSON.parse(JSON.stringify({ input, output }))).toStrictEqual({ input, output })
  })
})
