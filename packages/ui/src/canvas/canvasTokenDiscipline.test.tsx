import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import * as tokens from '../tokens.js'
import { canvasColors } from './canvasTokens.js'
import { FlowCanvas } from './FlowCanvas.js'
import { NodeCard } from './NodeCard.js'
import { MetadataRow } from './NodeStateBody.js'
import type { FlowCanvasEdge, FlowCanvasNode, NodeCardData } from './types.js'

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

const graphNodes: readonly FlowCanvasNode[] = [
  {
    id: 'start1',
    position: { x: 56, y: 248 },
    data: {
      id: 'start1',
      state: 'idle',
      isStart: true,
      selected: true,
      outputs: [
        { name: 'title', annotation: 'string' },
        { name: 'markdown', annotation: 'string' },
      ],
    },
  },
  {
    id: 'render',
    position: { x: 386, y: 150 },
    data: {
      id: 'render',
      state: 'running',
      status: 'running',
      elapsed: '1.3s',
      progress: 0.62,
      inputs: [{ name: 'title', annotation: 'received' }],
      outputs: [{ name: 'image', annotation: 'pending' }],
      outputSlot: {
        skeleton: true,
        skeletonLabel: 'rasterising 1024×1024',
        caption: 'frame 2 of 3',
        source: 'imageOut',
      },
    },
  },
  {
    id: 'publish',
    position: { x: 786, y: 380 },
    data: {
      id: 'publish',
      state: 'queued',
      status: 'queued',
      inputs: [{ name: 'image', annotation: 'waiting' }],
    },
  },
]

const graphEdges: readonly FlowCanvasEdge[] = [
  {
    id: 'e1',
    source: 'start1',
    sourceField: 'title',
    target: 'render',
    targetField: 'title',
    tone: 'active',
  },
  {
    id: 'e2',
    source: 'render',
    sourceField: 'image',
    target: 'publish',
    targetField: 'image',
    tone: 'waiting',
  },
]

/** Every state treatment the graph above does not already mount. */
const stateCards: readonly NodeCardData[] = [
  {
    id: 'queued-card',
    state: 'queued',
    status: 'queued',
    width: 288,
    detail: { kind: 'queued', waitingOn: 'render.image' },
  },
  {
    id: 'ok-card',
    state: 'ok',
    status: 'ok',
    elapsed: '2.1s',
    width: 288,
    detail: { kind: 'media', caption: <MetadataRow parts={['1024×1024', 'png', '412 kb']} /> },
  },
  {
    id: 'failed-card',
    state: 'failed',
    status: 'failed',
    elapsed: '0.8s',
    width: 288,
    detail: {
      kind: 'failed',
      errorName: 'ImageRenderError',
      message: 'Unsupported colour profile.',
    },
  },
  {
    id: 'cached-card',
    state: 'cached',
    status: 'cached',
    elapsed: '0.0s',
    width: 288,
    detail: { kind: 'media', dimmed: true, caption: 'reused from run #218' },
  },
]

function StateGallery() {
  return (
    <div>
      {stateCards.map((data) => (
        <NodeCard key={data.id} data={data} />
      ))}
    </div>
  )
}

describe('canvas token discipline', () => {
  const allowed = allowedColours()

  it('uses no colour the token layers do not define', async () => {
    const offenders: string[] = []

    const canvas = render(<FlowCanvas nodes={graphNodes} edges={graphEdges} startNodeId="start1" />)
    await screen.findByTestId('node-card-start1')
    offenders.push(...colourOffenders(canvas.container, allowed, 'canvas'))
    cleanup()

    const gallery = render(<StateGallery />)
    offenders.push(...colourOffenders(gallery.container, allowed, 'states'))
    cleanup()

    expect(offenders).toEqual([])
  })

  it('uses no font size outside the nine-step scale', async () => {
    const offenders: string[] = []

    const canvas = render(<FlowCanvas nodes={graphNodes} edges={graphEdges} startNodeId="start1" />)
    await screen.findByTestId('node-card-start1')
    offenders.push(...fontSizeOffenders(canvas.container, 'canvas'))
    cleanup()

    const gallery = render(<StateGallery />)
    offenders.push(...fontSizeOffenders(gallery.container, 'states'))
    cleanup()

    expect(offenders).toEqual([])
  })
})
