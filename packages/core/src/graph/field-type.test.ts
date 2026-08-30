import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import { asset } from '../asset.js'
import { areFieldTypesCompatible, fieldTypeOf, isRequiredField } from './field-type.js'

describe('fieldTypeOf()', () => {
  it('classifies the primitive kinds a connection can carry', () => {
    expect(fieldTypeOf(z.string())).toBe('string')
    expect(fieldTypeOf(z.url())).toBe('string')
    expect(fieldTypeOf(z.number())).toBe('number')
    expect(fieldTypeOf(z.int())).toBe('number')
    expect(fieldTypeOf(z.bigint())).toBe('bigint')
    expect(fieldTypeOf(z.boolean())).toBe('boolean')
    expect(fieldTypeOf(z.date())).toBe('date')
    expect(fieldTypeOf(z.object({ a: z.string() }))).toBe('object')
    expect(fieldTypeOf(z.array(z.string()))).toBe('array')
    expect(fieldTypeOf(z.tuple([z.string()]))).toBe('array')
  })

  it('looks through wrappers that change cardinality but not kind', () => {
    expect(fieldTypeOf(z.number().optional())).toBe('number')
    expect(fieldTypeOf(z.string().default('x'))).toBe('string')
    expect(fieldTypeOf(z.string().nullable())).toBe('string')
    expect(fieldTypeOf(z.string().readonly())).toBe('string')
    expect(fieldTypeOf(z.string().catch('x'))).toBe('string')
    expect(fieldTypeOf(z.string().optional().nonoptional())).toBe('string')
    expect(fieldTypeOf(z.string().pipe(z.coerce.number()))).toBe('number')
  })

  it('reads an enum or a literal as the kind of its values', () => {
    expect(fieldTypeOf(z.enum(['a', 'b']))).toBe('string')
    expect(fieldTypeOf(z.literal('a'))).toBe('string')
    expect(fieldTypeOf(z.literal(5))).toBe('number')
    expect(fieldTypeOf(z.literal(true))).toBe('boolean')
  })

  it('recognises a registered asset field, wrapped or bare', () => {
    expect(fieldTypeOf(asset({ mime: 'image/png' }))).toBe('asset')
    expect(fieldTypeOf(asset({ mime: 'image/png' }).optional())).toBe('asset')
    expect(fieldTypeOf(asset({ mime: 'image/png' }).describe('the render'))).toBe('asset')
  })

  it("answers 'unknown' for everything it cannot decide", () => {
    expect(fieldTypeOf(z.any())).toBe('unknown')
    expect(fieldTypeOf(z.unknown())).toBe('unknown')
    expect(fieldTypeOf(z.union([z.string(), z.number()]))).toBe('unknown')
    expect(fieldTypeOf(z.record(z.string(), z.string()))).toBe('unknown')
    expect(fieldTypeOf(z.custom<symbol>(() => true))).toBe('unknown')
    expect(fieldTypeOf(z.string().transform((value) => value.length))).toBe('unknown')
  })
})

describe('areFieldTypesCompatible()', () => {
  it('accepts equal kinds and rejects two different known kinds', () => {
    expect(areFieldTypesCompatible('string', 'string')).toBe(true)
    expect(areFieldTypesCompatible('asset', 'asset')).toBe(true)
    expect(areFieldTypesCompatible('string', 'number')).toBe(false)
    expect(areFieldTypesCompatible('asset', 'object')).toBe(false)
  })

  it("treats 'unknown' on either side as compatible, because it never guesses", () => {
    expect(areFieldTypesCompatible('unknown', 'number')).toBe(true)
    expect(areFieldTypesCompatible('number', 'unknown')).toBe(true)
  })
})

describe('isRequiredField()', () => {
  it('calls a field required exactly when its schema rejects undefined', () => {
    expect(isRequiredField(z.string())).toBe(true)
    expect(isRequiredField(z.string().nullable())).toBe(true)
    expect(isRequiredField(z.object({ a: z.string() }))).toBe(true)
    expect(isRequiredField(asset({ mime: 'image/png' }))).toBe(true)
  })

  it('calls optional, defaulted and permissive fields not required', () => {
    expect(isRequiredField(z.string().optional())).toBe(false)
    expect(isRequiredField(z.string().default('x'))).toBe(false)
    expect(isRequiredField(z.any())).toBe(false)
    expect(isRequiredField(z.unknown())).toBe(false)
  })

  it('does not throw on a schema that cannot be checked synchronously', () => {
    // `z.any()` lets `undefined` reach the refinement, the refinement is async, and zod throws
    // `$ZodAsyncError` during a synchronous parse. Without the guard this test throws instead of
    // returning. (`z.string().refine(async …)` would NOT prove this: the base string check fails
    // first and short-circuits the refinement, so nothing async ever runs.)
    expect(isRequiredField(z.any().refine(async () => true))).toBe(false)
  })
})
