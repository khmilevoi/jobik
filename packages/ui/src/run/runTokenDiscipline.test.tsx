import type { NodeInputDescriptor } from '@jobik/core'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import * as z from 'zod'
import { canvasColors } from '../canvas/canvasTokens.js'
import * as tokens from '../tokens.js'
import { RunPanelCard } from './RunPanel/RunPanel.js'
import { runPanelColors } from './runPanelTokens.js'
import type { RunPanelState } from './types.js'

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
  visit(runPanelColors)
  // Only reachable through `StripePlaceholder`, which paints the output thumbnail.
  visit(canvasColors)
  return found
}

const descriptor: NodeInputDescriptor = {
  nodeId: 'start1',
  fields: [
    { field: 'title', required: true, annotation: 'string', control: { kind: 'string' } },
    { field: 'markdown', required: true, annotation: 'string', control: { kind: 'string' } },
    {
      field: 'count',
      required: false,
      annotation: 'number',
      control: { kind: 'number', integer: true },
    },
    { field: 'draft', required: false, annotation: 'boolean', control: { kind: 'boolean' } },
    {
      field: 'format',
      required: false,
      annotation: 'string',
      control: { kind: 'enum', options: ['png'] },
    },
    {
      field: 'kind',
      required: true,
      annotation: 'string',
      control: { kind: 'literal', value: 'article' },
    },
    {
      field: 'cover',
      required: false,
      annotation: 'Buffer',
      control: { kind: 'asset', mime: 'image/png' },
    },
    {
      field: 'meta',
      required: false,
      annotation: 'object',
      control: { kind: 'json', schema: { type: 'object' } },
    },
  ],
}

const STATES: readonly { readonly name: string; readonly state: RunPanelState }[] = [
  {
    name: 'idle',
    state: {
      kind: 'idle',
      entryNodeId: 'start1',
      note: 'Inputs are typed from the flow declaration.',
      descriptor,
      input: z.object({ title: z.string() }),
      draft: { title: 'Typed flows, quietly', markdown: '## Release 0.4' },
      presentation: { markdown: 'area' },
      lastRun: {
        status: 'completed',
        totalElapsed: '2.4s',
        nodeCount: 3,
        timings: [{ nodeId: 'render', status: 'ok', elapsed: '2.1s' }],
      },
    },
  },
  {
    name: 'running',
    state: {
      kind: 'running',
      runNumber: 219,
      elapsed: '1.3s',
      completedNodes: 1,
      totalNodes: 3,
      progress: 0.54,
      note: 'Streaming output as each node settles.',
      partialOutput: true,
      nodes: [
        { nodeId: 'start1', status: 'ok', elapsed: '0.0s' },
        { nodeId: 'render', status: 'running', elapsed: '1.3s' },
        { nodeId: 'publish', status: 'queued' },
      ],
      log: {
        followLabel: 'follow',
        lines: [{ time: '0.00', text: 'start1 → emit title, markdown' }],
        pending: 'waiting for imageOut',
      },
    },
  },
  {
    name: 'failed',
    state: {
      kind: 'failed',
      runNumber: 220,
      elapsed: '0.8s',
      error: {
        name: 'ImageRenderError',
        nodeId: 'render',
        message: 'Unsupported colour profile.',
      },
      nodes: [
        { nodeId: 'start1', status: 'ok', elapsed: '0.0s' },
        { nodeId: 'render', status: 'failed' },
        { nodeId: 'publish', status: 'skipped' },
      ],
      stack: {
        frames: [{ fn: 'imageOut.raster', file: 'imageOut.ts', line: 184 }],
        hiddenFrames: 6,
      },
    },
  },
  {
    name: 'completed',
    state: {
      kind: 'completed',
      runNumber: 221,
      elapsed: '2.4s',
      nodes: [{ nodeId: 'render', status: 'ok', elapsed: '2.1s' }],
      outputs: [
        {
          kind: 'asset',
          field: 'image',
          asset: { type: 'Buffer', mime: 'image/png', bytes: 421888, id: 'a' },
          meta: 'png · 1024² · 412 kb',
        },
        { kind: 'text', field: 'caption', value: 'Release 0.4' },
        { kind: 'url', field: 'url', value: 'cdn.jobik.dev/p/219/cover.png' },
      ],
    },
  },
]

describe('run panel token discipline', () => {
  const allowed = allowedColours()

  it('uses no colour the token layers do not define', () => {
    const offenders: string[] = []
    for (const entry of STATES) {
      const { container } = render(<RunPanelCard state={entry.state} entryNodeId="start1" />)
      for (const element of container.querySelectorAll('[style]')) {
        const style = element.getAttribute('style') ?? ''
        for (const match of style.matchAll(COLOR_LITERAL)) {
          if (!allowed.has(normalise(match[0]))) {
            offenders.push(`[${entry.name}] ${match[0]} in "${style}"`)
          }
        }
      }
      for (const element of container.querySelectorAll('[fill]')) {
        const fill = element.getAttribute('fill') ?? ''
        if (fill.startsWith('url(') || fill === 'none') continue
        if (!allowed.has(normalise(fill))) offenders.push(`[${entry.name}] ${fill}`)
      }
      cleanup()
    }
    expect(offenders).toEqual([])
  })

  it('uses no font size outside the nine-step scale', () => {
    const offenders: string[] = []
    for (const entry of STATES) {
      const { container } = render(<RunPanelCard state={entry.state} entryNodeId="start1" />)
      for (const element of container.querySelectorAll<HTMLElement>('[style]')) {
        const size = element.style.fontSize
        if (size === '') continue
        const value = Number.parseFloat(size)
        if (!(tokens.typeScale as readonly number[]).includes(value)) {
          offenders.push(`[${entry.name}] ${size}`)
        }
      }
      cleanup()
    }
    expect(offenders).toEqual([])
  })
})
