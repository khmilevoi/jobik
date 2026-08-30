import { describe, expect, it } from 'vitest'
import { formatBytes, groupDigits } from './format.js'

describe('groupDigits', () => {
  it('groups thousands with the plain space the artboard uses', () => {
    expect(groupDigits(654336)).toBe('654 336') // design 944
  })

  it('leaves short numbers alone and keeps a fraction intact', () => {
    expect(groupDigits(0)).toBe('0')
    expect(groupDigits(999)).toBe('999')
    expect(groupDigits(1000)).toBe('1 000')
    expect(groupDigits(1234567)).toBe('1 234 567')
    expect(groupDigits(1234.5)).toBe('1 234.5')
    expect(groupDigits(-1234)).toBe('-1 234')
  })
})

describe('formatBytes', () => {
  it('reproduces all four readouts the artboards print', () => {
    expect(formatBytes(421888)).toBe('412 kb') // design 904
    expect(formatBytes(212992)).toBe('208 kb') // design 917
    expect(formatBytes(34816)).toBe('34 kb') // design 924
    expect(formatBytes(1434)).toBe('1.4 kb') // design 961
  })

  it('stays in bytes below a kilobyte and never rolls over to mb', () => {
    expect(formatBytes(0)).toBe('0 b')
    expect(formatBytes(1023)).toBe('1023 b')
    expect(formatBytes(1024)).toBe('1.0 kb')
    expect(formatBytes(10 * 1024 * 1024)).toBe('10240 kb')
  })
})
