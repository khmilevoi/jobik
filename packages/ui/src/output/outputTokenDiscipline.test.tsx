import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { canvasColors } from '../canvas/canvasTokens.js'
import * as tokens from '../tokens.js'
import type { OutputComponentProps } from './flowUi.js'
import { OutputPreview } from './OutputPreview.js'
import { OutputViewer } from './OutputViewer.js'
import { outputColors } from './outputTokens.js'

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

function allowedColours(): Set<string> {
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
  visit(canvasColors)
  visit(outputColors)
  return found
}

function colourOffenders(container: HTMLElement, allowed: Set<string>, tree: string): string[] {
  const offenders: string[] = []
  for (const element of container.querySelectorAll('[style]')) {
    const style = element.getAttribute('style') ?? ''
    for (const match of style.matchAll(COLOR_LITERAL)) {
      if (!allowed.has(normalise(match[0]))) offenders.push(`[${tree}] ${match[0]} in "${style}"`)
    }
  }
  for (const attribute of ['stroke', 'fill'] as const) {
    for (const element of container.querySelectorAll(`[${attribute}]`)) {
      const value = element.getAttribute(attribute) ?? ''
      if (value === 'none' || value.startsWith('url(')) continue
      for (const match of value.matchAll(COLOR_LITERAL)) {
        if (!allowed.has(normalise(match[0]))) offenders.push(`[${tree}] ${attribute}=${value}`)
      }
    }
  }
  return offenders
}

function fontSizeOffenders(container: HTMLElement, tree: string): string[] {
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

const output = {
  image: { type: 'Buffer', mime: 'image/png', bytes: 654336, id: 'a1' },
  caption: 'Release 0.4 — field…',
}

function ArtboardOutput(_props: OutputComponentProps) {
  return (
    <OutputPreview
      primary={{ label: 'cover.png', meta: ['1024×1024', 'png', '412 kb'], metaTrailing: 'sRGB' }}
      variants={[
        { label: 'og.png', caption: '1200×630 · 208 kb' },
        { label: 'thumb.png', caption: '320×320 · 34 kb' },
      ]}
      emptyVariants={1}
      typedValues={[
        { name: 'caption', value: 'Release 0.4 — field-level connections' },
        { name: 'url', value: 'cdn.jobik.dev/p/219/cover.png', tone: 'url' },
        { name: 'bytes', value: 654336 },
        { name: 'checksum', value: 'sha256:9f2c…d41a', tone: 'opaque' },
      ]}
    />
  )
}

const descriptor = { nodes: { render: { Output: ArtboardOutput } } }
const logs = [{ time: '0.31', message: 'render layout pass complete' }]

describe('output viewer token discipline', () => {
  const allowed = allowedColours()

  it('uses no colour the token layers do not define, on any tab', () => {
    const offenders: string[] = []
    for (const tab of ['preview', 'raw', 'logs'] as const) {
      const view = render(
        <OutputViewer
          nodeId="render"
          output={output}
          descriptor={descriptor}
          source="render.image · Buffer[3]"
          logs={logs}
          defaultTab={tab}
          onCopyAll={() => {}}
          onDownload={() => {}}
        />,
      )
      offenders.push(...colourOffenders(view.container, allowed, tab))
      cleanup()
    }
    expect(offenders).toEqual([])
  })

  it('uses no font size off the nine-step scale, on any tab', () => {
    const offenders: string[] = []
    for (const tab of ['preview', 'raw', 'logs'] as const) {
      const view = render(
        <OutputViewer
          nodeId="render"
          output={output}
          descriptor={descriptor}
          logs={logs}
          defaultTab={tab}
        />,
      )
      offenders.push(...fontSizeOffenders(view.container, tab))
      cleanup()
    }
    expect(offenders).toEqual([])
  })

  it('falls back without inventing a colour either', () => {
    const view = render(<OutputViewer nodeId="publish" output={output} descriptor={descriptor} />)
    expect(screen.getByTestId('generic-output')).toBeInTheDocument()
    expect(colourOffenders(view.container, allowed, 'fallback')).toEqual([])
  })
})
