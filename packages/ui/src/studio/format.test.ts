import { describe, expect, it } from 'vitest'
import { formatElapsed, formatLogTime } from './format.js'

describe('formatElapsed', () => {
  it('renders one decimal and an s, as the artboards do', () => {
    expect(formatElapsed(2100)).toBe('2.1s')
    expect(formatElapsed(0)).toBe('0.0s')
    expect(formatElapsed(1349)).toBe('1.3s')
  })

  it('never renders a negative elapsed time', () => {
    expect(formatElapsed(-5)).toBe('0.0s')
  })

  it('rounds an exactly-one-minute elapsed time to whole seconds', () => {
    expect(formatElapsed(60_000)).toBe('60.0s')
  })

  it('renders across an hour boundary as plain seconds, no unit switch', () => {
    expect(formatElapsed(3_600_000)).toBe('3600.0s')
  })
})

describe('formatLogTime', () => {
  it('renders two decimals and no unit, as the live log does', () => {
    expect(formatLogTime(0)).toBe('0.00')
    expect(formatLogTime(310)).toBe('0.31')
    expect(formatLogTime(12_000)).toBe('12.00')
  })

  it('clamps a stamp that precedes the run start', () => {
    expect(formatLogTime(-40)).toBe('0.00')
  })

  it('renders exactly one minute as 60.00, no unit switch', () => {
    expect(formatLogTime(60_000)).toBe('60.00')
  })

  it('renders across an hour boundary as plain seconds', () => {
    expect(formatLogTime(3_600_000)).toBe('3600.00')
  })
})
