import { describe, expect, it } from 'vitest'
import {
  formatAssetMeta,
  formatHiddenFrames,
  formatLastRunMeta,
  formatNodesComplete,
  formatRunMeta,
  formatStackFrame,
  runNodeStatusLabel,
} from './format.js'

describe('formatNodesComplete', () => {
  it('reads the artboard line verbatim', () => {
    expect(formatNodesComplete(1, 3)).toBe('1 of 3 nodes complete')
  })

  it('says node, not nodes, for a one-node run', () => {
    expect(formatNodesComplete(0, 1)).toBe('0 of 1 node complete')
  })
})

describe('formatRunMeta', () => {
  it('is the run number alone while a run is in flight', () => {
    expect(formatRunMeta(219)).toBe('#219')
  })

  it('adds the elapsed time once the run has settled', () => {
    expect(formatRunMeta(220, '0.8s')).toBe('#220 · 0.8s')
    expect(formatRunMeta(221, '2.4s')).toBe('#221 · 2.4s')
  })
})

describe('formatLastRunMeta', () => {
  it('reads the artboard line verbatim', () => {
    expect(formatLastRunMeta('2.4s', 3)).toBe('2.4s · 3 nodes')
  })

  it('says node, not nodes, for a one-node run', () => {
    expect(formatLastRunMeta('0.1s', 1)).toBe('0.1s · 1 node')
  })
})

describe('formatStackFrame', () => {
  it('reads the artboard frames verbatim', () => {
    expect(formatStackFrame({ fn: 'imageOut.raster', file: 'imageOut.ts', line: 184 })).toBe(
      'at imageOut.raster (imageOut.ts:184)',
    )
    expect(formatStackFrame({ fn: 'render.invoke', file: 'flow.ts', line: 41 })).toBe(
      'at render.invoke (flow.ts:41)',
    )
  })
})

describe('formatHiddenFrames', () => {
  it('reads the artboard line verbatim', () => {
    expect(formatHiddenFrames(6)).toBe('↳ 6 frames hidden')
  })

  it('says frame, not frames, for a single hidden frame', () => {
    expect(formatHiddenFrames(1)).toBe('↳ 1 frame hidden')
  })

  it('is undefined when nothing is hidden, so the line is not rendered', () => {
    expect(formatHiddenFrames(0)).toBeUndefined()
  })
})

describe('formatAssetMeta', () => {
  it('is the mime subtype and the size in kb', () => {
    expect(formatAssetMeta({ type: 'Buffer', mime: 'image/png', bytes: 421888, id: 'a1' })).toBe(
      'png · 412 kb',
    )
  })

  it('reports bytes below a kilobyte rather than rounding to zero', () => {
    expect(formatAssetMeta({ type: 'Buffer', mime: 'image/webp', bytes: 900, id: 'a2' })).toBe(
      'webp · 900 b',
    )
  })

  it('falls back to the whole mime when it has no subtype', () => {
    expect(formatAssetMeta({ type: 'Buffer', mime: 'application', bytes: 2048, id: 'a3' })).toBe(
      'application · 2 kb',
    )
  })
})

describe('runNodeStatusLabel', () => {
  it('shows the elapsed time when the node reported one', () => {
    expect(runNodeStatusLabel({ nodeId: 'render', status: 'ok', elapsed: '2.1s' })).toBe('2.1s')
    expect(runNodeStatusLabel({ nodeId: 'render', status: 'running', elapsed: '1.3s' })).toBe(
      '1.3s',
    )
  })

  it('shows the status word when it did not', () => {
    expect(runNodeStatusLabel({ nodeId: 'publish', status: 'queued' })).toBe('queued')
    expect(runNodeStatusLabel({ nodeId: 'render', status: 'failed' })).toBe('failed')
    expect(runNodeStatusLabel({ nodeId: 'publish', status: 'skipped' })).toBe('skipped')
  })
})
