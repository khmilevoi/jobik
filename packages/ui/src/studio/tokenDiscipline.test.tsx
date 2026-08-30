import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import * as tokens from '../tokens.js'
import { Studio } from './Studio.js'

afterEach(cleanup)

const COLOR_LITERAL = /#[0-9a-fA-F]{6}|rgba?\([^)]*\)/g

/** jsdom rewrites hex colours to `rgb()` in the serialised style, so compare in one space. */
function normalise(literal: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(literal)?.[1]
  if (hex !== undefined) {
    const value = Number.parseInt(hex, 16)
    return `rgb(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255})`
  }
  return literal
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/([(,])\./g, '$10.')
}

function tokenColours(): Set<string> {
  const found = new Set<string>()
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(COLOR_LITERAL)) found.add(normalise(match[0]))
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    if (value !== null && typeof value === 'object') {
      for (const item of Object.values(value)) visit(item)
    }
  }
  visit(tokens)
  return found
}

describe('token discipline', () => {
  const allowed = tokenColours()

  it('uses no colour the token layer does not define', () => {
    const { container } = render(<Studio />)
    const offenders: string[] = []
    for (const element of container.querySelectorAll('[style]')) {
      const style = element.getAttribute('style') ?? ''
      for (const match of style.matchAll(COLOR_LITERAL)) {
        if (!allowed.has(normalise(match[0]))) offenders.push(`${match[0]} in "${style}"`)
      }
    }
    for (const element of container.querySelectorAll('[stroke]')) {
      const stroke = element.getAttribute('stroke') ?? ''
      if (stroke !== 'none' && !allowed.has(normalise(stroke))) offenders.push(stroke)
    }
    expect(offenders).toEqual([])
  })

  it('uses no font size outside the nine-step scale', () => {
    const { container } = render(<Studio />)
    const offenders: string[] = []
    for (const element of container.querySelectorAll<HTMLElement>('[style]')) {
      const size = element.style.fontSize
      if (size === '') continue
      const value = Number.parseFloat(size)
      if (!(tokens.typeScale as readonly number[]).includes(value)) offenders.push(size)
    }
    expect(offenders).toEqual([])
  })
})
