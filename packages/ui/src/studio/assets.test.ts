import type { AssetDescriptor } from '@jobik/core'
import { describe, expect, it, vi } from 'vitest'
import type { WireNodeReportPayload } from '../client/index.js'
import { isUrlValue, toOutputFields } from './assets.js'

// Ruling R1: the server's `serialiseNodeOutput` writes the same descriptor into both `output` and
// `assets`, keyed by the same field name — a genuinely disjoint fixture would hide the bug the
// duplicate-name counter had, so `render.image` below mirrors both maps the way the wire does.
const IMAGE_ASSET: AssetDescriptor = {
  type: 'Buffer',
  mime: 'image/png',
  bytes: 421_888,
  id: 'asset-1',
}

const NODES: readonly WireNodeReportPayload[] = [
  {
    nodeId: 'render',
    status: 'ok',
    elapsedMs: 2100,
    output: { caption: 'A cover for the post', image: IMAGE_ASSET },
    assets: { image: IMAGE_ASSET },
    error: null,
  },
  {
    nodeId: 'publish',
    status: 'ok',
    elapsedMs: 290,
    output: { url: 'https://cdn.jobik.dev/p/cover.png' },
    assets: {},
    error: null,
  },
  {
    nodeId: 'ghost',
    status: 'skipped',
    elapsedMs: 0,
    output: null,
    assets: {},
    error: null,
  },
]

describe('toOutputFields', () => {
  it('emits one asset field per binary output, not two, leaving thumbnail and onOpen for StudioApp', () => {
    const fields = toOutputFields({ nodes: NODES })

    expect(fields).toEqual([
      { kind: 'text', field: 'caption', value: 'A cover for the post' },
      {
        kind: 'asset',
        field: 'image',
        asset: IMAGE_ASSET,
        thumbnail: undefined,
        onOpen: undefined,
      },
      { kind: 'url', field: 'url', value: 'https://cdn.jobik.dev/p/cover.png' },
    ])
  })

  it('does not qualify a field just because it appears in both output and assets for one node', () => {
    // Regression for R1: before the fix, the counter incremented once in the output loop and once
    // in the assets loop for the very same field, so a single asset field was always mis-qualified
    // as `render.image` even with only one node in the whole run.
    const fields = toOutputFields({
      nodes: [
        {
          nodeId: 'render',
          status: 'ok',
          elapsedMs: 1,
          output: { image: IMAGE_ASSET },
          assets: { image: IMAGE_ASSET },
          error: null,
        },
      ],
    })

    expect(fields).toEqual([
      {
        kind: 'asset',
        field: 'image',
        asset: IMAGE_ASSET,
        thumbnail: undefined,
        onOpen: undefined,
      },
    ])
  })

  it('classifies a URL-valued string as a url field and everything else as text', () => {
    const fields = toOutputFields({ nodes: NODES })

    expect(fields.find((field) => field.field === 'url')?.kind).toBe('url')
    expect(fields.find((field) => field.field === 'caption')?.kind).toBe('text')
  })

  it('skips nodes that produced no output', () => {
    const fields = toOutputFields({ nodes: NODES })

    // `ghost` produced neither an `output` nor an `assets` entry, so nothing it could have named
    // survives into the field set: no emitted field name traces back to it (bare or qualified),
    // and the total count is exactly what `render` (caption, image) and `publish` (url) contribute.
    expect(
      fields.some((field) => field.field === 'ghost' || field.field.startsWith('ghost.')),
    ).toBe(false)
    expect(fields).toHaveLength(3)
  })

  it('qualifies a field name that two nodes both produced', () => {
    const fields = toOutputFields({
      nodes: [
        {
          nodeId: 'a',
          status: 'ok',
          elapsedMs: 1,
          output: { url: 'https://a' },
          assets: {},
          error: null,
        },
        {
          nodeId: 'b',
          status: 'ok',
          elapsedMs: 1,
          output: { url: 'https://b' },
          assets: {},
          error: null,
        },
      ],
    })

    expect(fields.map((field) => field.field)).toEqual(['a.url', 'b.url'])
  })

  it('serialises a non-string, non-asset output value as JSON text', () => {
    const fields = toOutputFields({
      nodes: [
        { nodeId: 'a', status: 'ok', elapsedMs: 1, output: { count: 3 }, assets: {}, error: null },
      ],
    })

    expect(fields[0]).toEqual({ kind: 'text', field: 'count', value: '3' })
  })

  // R37: `field` can be QUALIFIED (`render.image`) once two nodes share a name, so a caller can
  // never recover the owning node id by searching a node's own `assets` map for that label —
  // `onOpenAsset` is called from inside this function's own per-node loop instead, which already
  // has the real `node.nodeId` in hand.
  it('builds onOpen from the real owning node id, not from the (possibly qualified) field label', () => {
    const onOpenAsset = vi.fn((nodeId: string) => () => nodeId)

    const fields = toOutputFields({
      nodes: [
        {
          nodeId: 'render',
          status: 'ok',
          elapsedMs: 1,
          output: {},
          assets: { image: IMAGE_ASSET },
          error: null,
        },
        {
          nodeId: 'publish',
          status: 'ok',
          elapsedMs: 1,
          output: { image: 'a string that collides with render’s asset field name' },
          assets: {},
          error: null,
        },
      ],
      onOpenAsset,
    })

    const asset = fields.find((field) => field.kind === 'asset')
    expect(asset?.field).toBe('render.image')
    expect(onOpenAsset).toHaveBeenCalledWith('render')
    expect(asset?.kind === 'asset' && asset.onOpen?.()).toBe('render')
  })
})

describe('isUrlValue', () => {
  it('accepts http and https and nothing else', () => {
    expect(isUrlValue('https://cdn.jobik.dev/p/cover.png')).toBe(true)
    expect(isUrlValue('http://localhost:4318/x')).toBe(true)
    expect(isUrlValue('/api/assets/a')).toBe(false)
    expect(isUrlValue('not a url')).toBe(false)
    expect(isUrlValue(12)).toBe(false)
  })
})
