import path from 'node:path'
import * as jobik from '@jobik/core'
import { describe, expect, it } from 'vitest'
import { ImageRenderError } from '../../../../examples/showcase/publication/nodes/index.js'
import {
  isTaxonomyWireError,
  serialiseNodeOutput,
  serialiseRunReport,
  toNodeWireError,
  toRunWireEvent,
} from './runWire.js'
import { WIRE_MESSAGES } from './wireError.js'

const flowRoot = path.resolve('jobik-wire-fixture', 'publication')

const descriptor: jobik.AssetDescriptor = {
  type: 'Buffer',
  mime: 'image/png',
  bytes: 3,
  id: 'asset-1',
}

function reportWith(node: jobik.NodeReport): jobik.RunReport {
  return {
    flowName: 'publication',
    startId: 'start1',
    runNumber: 219,
    status: node.status === 'ok' ? 'ok' : 'failed',
    elapsedMs: 812,
    nodes: [node],
    logs: [{ nodeId: node.nodeId, message: 'rasterising', at: 1_700_000_000_000 }],
    error: null,
  }
}

describe('serialiseNodeOutput', () => {
  it('swaps a declared asset field for its descriptor and leaves JSON fields alone', () => {
    expect(
      serialiseNodeOutput({
        output: { image: Buffer.from([1, 2, 3]), caption: 'Release 0.4' },
        assets: { image: descriptor },
      }),
    ).toEqual({ image: descriptor, caption: 'Release 0.4' })
  })

  it('never inlines bytes that no descriptor stands for, however deeply they are nested', () => {
    expect(
      serialiseNodeOutput({
        output: { meta: { thumbnail: Buffer.from([9, 9]), width: 1024 } },
        assets: {},
      }),
    ).toEqual({ meta: { thumbnail: null, width: 1024 } })
  })

  it('neutralises the values JSON.stringify would throw on or mangle', () => {
    const serialised = serialiseNodeOutput({
      output: { count: 10n, seen: new Set([1]), when: new Date(0), tags: ['a'] },
      assets: {},
    })
    expect(serialised).toEqual({
      count: null,
      seen: null,
      when: '1970-01-01T00:00:00.000Z',
      tags: ['a'],
    })
    expect(() => JSON.stringify(serialised)).not.toThrow()
  })

  it('passes a null output through', () => {
    expect(serialiseNodeOutput({ output: null, assets: {} })).toBeNull()
  })

  it('breaks a cycle rather than blowing the call stack', () => {
    const cyclic: Record<string, unknown> = { name: 'self' }
    cyclic.parent = cyclic
    const item = { id: 'shared' }
    const serialised = serialiseNodeOutput({
      output: { meta: cyclic, refs: { primary: item, list: [item] } },
      assets: {},
    })
    expect(() => JSON.stringify(serialised)).not.toThrow()

    const meta = serialised?.meta as Record<string, unknown>
    expect(meta.parent).toBeNull()

    // A shared, non-cyclic reference is not a cycle: it must survive on every branch that reaches
    // it, the same way `JSON.stringify` would duplicate it rather than null one occurrence out.
    const refs = serialised?.refs as { primary: unknown; list: unknown[] }
    expect(refs.list[0]).not.toBeNull()
    expect(refs.list[0]).toEqual({ id: 'shared' })
  })
})

describe('toNodeWireError', () => {
  it('attaches the trimmed stack to a NodeExecutionError and never the cause', () => {
    const cause = new Error('boom')
    cause.stack = [
      'Error: boom',
      `    at raster (${path.join(flowRoot, 'nodes', 'imageOut.ts')}:184:11)`,
    ].join('\n')
    const error = new jobik.NodeExecutionError({ nodeId: 'render', runNumber: 219, cause })
    expect(toNodeWireError({ error, flowRoot })).toEqual({
      _tag: 'NodeExecutionError',
      message: 'Node render failed',
      nodeId: 'render',
      runNumber: 219,
      frames: [{ fn: 'raster', file: 'nodes/imageOut.ts', line: 184 }],
      hiddenFrames: 0,
    })
  })

  it('projects another taxonomy error through P10 unchanged', () => {
    const error = new jobik.UpstreamFailedError({
      nodeId: 'publish',
      upstreamNodeId: 'render',
      runNumber: 219,
    })
    const wire = toNodeWireError({ error, flowRoot })
    expect(wire).toEqual({
      _tag: 'UpstreamFailedError',
      message: 'Node publish was skipped because upstream node render failed',
      nodeId: 'publish',
      upstreamNodeId: 'render',
      runNumber: 219,
    })
    expect(isTaxonomyWireError(wire)).toBe(true)
  })

  // The returned side of the split. `ImageRenderError` is the example's own tagged error and the
  // one the design's failed artboard shows; `imageOut` RETURNS it, so this is the real path.
  it('carries a tagged error a handler RETURNED across with its own tag and message', () => {
    const returned = new ImageRenderError({ profile: 'CMYK', line: 4 })
    expect(returned.message).toContain('CMYK')
    const wire = toNodeWireError({ error: returned, flowRoot })
    expect(wire).toEqual({
      _tag: 'ImageRenderError',
      message: returned.message,
      authored: true,
    })
    expect(isTaxonomyWireError(wire)).toBe(false)
  })

  // The thrown side of the split. This is the one a future refactor breaks silently, so it asserts
  // the absence of the author's prose directly rather than only the resulting shape.
  it('drops the tag and message of an error a handler THREW, because the engine wrapped it', () => {
    const thrown = new ImageRenderError({ profile: 'CMYK', line: 4 })
    // Exactly what `execute.ts`'s handler boundary builds from a throw or a rejection.
    const wrapped = new jobik.NodeExecutionError({
      nodeId: 'render',
      runNumber: 219,
      cause: thrown,
    })
    const wire = toNodeWireError({ error: wrapped, flowRoot })
    expect(wire).toEqual({
      _tag: 'NodeExecutionError',
      message: 'Node render failed',
      nodeId: 'render',
      runNumber: 219,
      frames: expect.any(Array),
      hiddenFrames: expect.any(Number),
    })
    const serialised = JSON.stringify(wire)
    expect(serialised).not.toContain('CMYK')
    expect(serialised).not.toContain('ImageRenderError')
  })

  it('reduces a returned error carrying no tag at all to the untagged constant', () => {
    expect(toNodeWireError({ error: new Error('raw handler prose'), flowRoot })).toEqual({
      _tag: null,
      message: WIRE_MESSAGES.internal,
    })
  })
})

describe('serialiseRunReport', () => {
  it('produces a report the browser can hold: descriptors, projections, no Error instances', () => {
    const wire = serialiseRunReport({
      report: reportWith({
        nodeId: 'render',
        status: 'ok',
        elapsedMs: 511,
        output: { image: Buffer.from([1, 2, 3]), caption: 'Release 0.4' },
        assets: { image: descriptor },
        error: null,
      }),
      flowRoot,
    })
    expect(wire).toEqual({
      flowName: 'publication',
      startId: 'start1',
      runNumber: 219,
      status: 'ok',
      elapsedMs: 812,
      nodes: [
        {
          nodeId: 'render',
          status: 'ok',
          elapsedMs: 511,
          output: { image: descriptor, caption: 'Release 0.4' },
          assets: { image: descriptor },
          error: null,
        },
      ],
      logs: [{ nodeId: 'render', message: 'rasterising', at: 1_700_000_000_000 }],
      error: null,
    })
  })

  it('projects the abort error of a cancelled run', () => {
    const cancelled: jobik.RunReport = {
      ...reportWith({
        nodeId: 'render',
        status: 'skipped',
        elapsedMs: 3,
        output: null,
        assets: {},
        error: null,
      }),
      status: 'cancelled',
      error: new jobik.RunCancelledError({ runNumber: 219 }),
    }
    expect(serialiseRunReport({ report: cancelled, flowRoot }).error).toEqual({
      _tag: 'RunCancelledError',
      message: 'The run was cancelled',
      runNumber: 219,
    })
  })
})

describe('toRunWireEvent', () => {
  it('carries a node-status transition across with its error projected', () => {
    const error = new jobik.UpstreamFailedError({
      nodeId: 'publish',
      upstreamNodeId: 'render',
      runNumber: 219,
    })
    expect(
      toRunWireEvent({
        event: { type: 'node-status', nodeId: 'publish', status: 'skipped', elapsedMs: 0, error },
        flowRoot,
      }),
    ).toEqual({
      type: 'node-status',
      nodeId: 'publish',
      status: 'skipped',
      elapsedMs: 0,
      error: {
        _tag: 'UpstreamFailedError',
        message: 'Node publish was skipped because upstream node render failed',
        nodeId: 'publish',
        upstreamNodeId: 'render',
        runNumber: 219,
      },
    })
  })

  it('carries run-started and node-log across unchanged', () => {
    const started = {
      type: 'run-started',
      runNumber: 219,
      flowName: 'publication',
      startId: 'start1',
      nodeCount: 3,
    } as const
    expect(toRunWireEvent({ event: started, flowRoot })).toEqual(started)
    const line = { nodeId: 'render', message: 'rasterising', at: 1 }
    expect(toRunWireEvent({ event: { type: 'node-log', line }, flowRoot })).toEqual({
      type: 'node-log',
      line,
    })
  })

  it('serialises the report a run-settled event carries', () => {
    const event: jobik.RunEvent = {
      type: 'run-settled',
      report: reportWith({
        nodeId: 'render',
        status: 'ok',
        elapsedMs: 4,
        output: { image: Buffer.from([1, 2, 3]) },
        assets: { image: descriptor },
        error: null,
      }),
    }
    const wire = toRunWireEvent({ event, flowRoot })
    expect(wire.type).toBe('run-settled')
    if (wire.type !== 'run-settled') return
    expect(wire.report.nodes[0].output).toEqual({ image: descriptor })
  })
})

it('serializes incremental node results exactly like the final node report', () => {
  const node: jobik.NodeReport = {
    nodeId: 'render',
    status: 'ok',
    elapsedMs: 2,
    output: { image: Buffer.from([1, 2, 3]), nested: { bytes: Buffer.from([9]) } },
    assets: { image: descriptor },
    error: null,
  }
  const final = serialiseRunReport({ report: reportWith(node), flowRoot })
  expect(
    toRunWireEvent({ event: { type: 'node-settled', runNumber: 219, node }, flowRoot }),
  ).toEqual({ type: 'node-settled', runNumber: 219, node: final.nodes[0] })
})
