import { afterEach, expect, it, vi } from 'vitest'
import { uploadValueJson } from './uploadValue.js'

afterEach(() => vi.restoreAllMocks())
it('refuses repeated string payloads before serializing the whole response', () => {
  const stringify = vi.spyOn(JSON, 'stringify')
  const value = Array.from({ length: 2000 }, () => 'x'.repeat(1024))
  expect(uploadValueJson(value)).toBeInstanceOf(Error)
  expect(
    stringify.mock.calls.some(
      ([argument]) =>
        argument !== null && typeof argument === 'object' && Object.hasOwn(argument, 'value'),
    ),
  ).toBe(false)
})
it('accounts for escaped multibyte values and keys before response serialization', () => {
  const stringify = vi.spyOn(JSON, 'stringify')
  const value = Object.fromEntries(
    Array.from({ length: 2000 }, (_, i) => [`${i}${'\u0000'.repeat(256)}`, '\u00e9'.repeat(256)]),
  )
  expect(uploadValueJson(value)).toBeInstanceOf(Error)
  expect(
    stringify.mock.calls.some(
      ([argument]) =>
        argument !== null && typeof argument === 'object' && Object.hasOwn(argument, 'value'),
    ),
  ).toBe(false)
})
it('accepts a JSON value exactly at the response byte limit', () => {
  const value = 'x'.repeat(1024 * 1024 - 12)
  const result = uploadValueJson(value)
  expect(result).not.toBeInstanceOf(Error)
  if (result instanceof Error) return
  expect(Buffer.byteLength(result.json)).toBe(1024 * 1024)
  expect(JSON.parse(result.json)).toEqual({ value })
})
