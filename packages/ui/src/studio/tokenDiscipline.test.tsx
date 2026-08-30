import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { Button, Chip, InsetWell, TypeAnnotation } from '../primitives/index.js'
import { runPanelColors } from '../run/index.js'
import * as tokens from '../tokens.js'
import { RunningChip, SaveConflictChip } from './RunningChip.js'
import { Studio } from './Studio.js'
import { studioColors } from './studioTokens.js'

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
  visit(runPanelColors)
  visit(studioColors)
  return found
}

/** The primitive cells nothing else in `<Studio />` mounts, default or collapsed. */
function Gallery() {
  return (
    <div>
      <Button variant="quiet" size="sm">
        Quiet sm
      </Button>
      <Button variant="quiet" size="md">
        Quiet md
      </Button>
      <Button variant="outlined" size="md">
        Outlined md
      </Button>
      <Button variant="accent" size="lg" hint="⌘R">
        Run
      </Button>
      <Button variant="accent" size="xs">
        Accent xs
      </Button>
      <Chip tone="accent" gap={9} trailing={<span>Cancel</span>}>
        Running
      </Chip>
      <InsetWell>control well</InsetWell>
      <InsetWell variant="output">output well</InsetWell>
      <TypeAnnotation>string</TypeAnnotation>
      <RunningChip startId="start1" elapsed="1.3s" />
      <SaveConflictChip />
    </div>
  )
}

function collectColourOffenders(
  container: HTMLElement,
  allowed: Set<string>,
  tree: string,
): string[] {
  const offenders: string[] = []
  for (const element of container.querySelectorAll('[style]')) {
    const style = element.getAttribute('style') ?? ''
    for (const match of style.matchAll(COLOR_LITERAL)) {
      if (!allowed.has(normalise(match[0]))) offenders.push(`[${tree}] ${match[0]} in "${style}"`)
    }
  }
  for (const element of container.querySelectorAll('[stroke]')) {
    const stroke = element.getAttribute('stroke') ?? ''
    if (stroke !== 'none' && !allowed.has(normalise(stroke))) offenders.push(`[${tree}] ${stroke}`)
  }
  return offenders
}

function collectFontSizeOffenders(container: HTMLElement, tree: string): string[] {
  const offenders: string[] = []
  for (const element of container.querySelectorAll<HTMLElement>('[style]')) {
    const size = element.style.fontSize
    if (size === '') continue
    const value = Number.parseFloat(size)
    if (!(tokens.typeScale as readonly number[]).includes(value))
      offenders.push(`[${tree}] ${size}`)
  }
  return offenders
}

/** Renders `<Studio />` collapsed: both docked controls in the top bar, both panels gone. */
async function renderCollapsedStudio(): Promise<HTMLElement> {
  const { container } = render(<Studio />)
  await userEvent.click(screen.getByRole('button', { name: 'Collapse flows and nodes' }))
  await userEvent.click(screen.getByRole('button', { name: 'Collapse run panel' }))
  return container
}

describe('token discipline', () => {
  const allowed = tokenColours()

  it('uses no colour the token layer does not define', async () => {
    const offenders: string[] = []

    const defaultTree = render(<Studio />)
    offenders.push(...collectColourOffenders(defaultTree.container, allowed, 'default'))
    cleanup()

    const collapsedContainer = await renderCollapsedStudio()
    offenders.push(...collectColourOffenders(collapsedContainer, allowed, 'collapsed'))
    cleanup()

    const galleryTree = render(<Gallery />)
    offenders.push(...collectColourOffenders(galleryTree.container, allowed, 'gallery'))
    cleanup()

    expect(offenders).toEqual([])
  })

  it('uses no font size outside the nine-step scale', async () => {
    const offenders: string[] = []

    const defaultTree = render(<Studio />)
    offenders.push(...collectFontSizeOffenders(defaultTree.container, 'default'))
    cleanup()

    const collapsedContainer = await renderCollapsedStudio()
    offenders.push(...collectFontSizeOffenders(collapsedContainer, 'collapsed'))
    cleanup()

    const galleryTree = render(<Gallery />)
    offenders.push(...collectFontSizeOffenders(galleryTree.container, 'gallery'))
    cleanup()

    expect(offenders).toEqual([])
  })
})
