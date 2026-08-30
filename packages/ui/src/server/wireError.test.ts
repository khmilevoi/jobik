import * as jobik from '@jobik/core'
import { describe, expect, it } from 'vitest'
import {
  isJobikError,
  toWireError,
  toWireErrorBody,
  untaggedWireErrorBody,
  WIRE_MESSAGES,
  wireErrorStatus,
} from './wireError.js'
import { findUnsafeValues } from './wireSafety.js'

const documentPath = '/home/dev/flows/publication/flow.jobik.json'

describe('isJobikError', () => {
  it('accepts every tag the taxonomy declares', () => {
    expect(isJobikError(new jobik.FlowSaveError({ path: documentPath }))).toBe(true)
    expect(isJobikError(new jobik.RunCancelledError({ runNumber: 219 }))).toBe(true)
  })

  it('rejects a plain error, a foreign tagged error and a non-error', () => {
    expect(isJobikError(new Error('boom'))).toBe(false)
    expect(isJobikError(Object.assign(new Error('boom'), { _tag: 'ImageRenderError' }))).toBe(false)
    expect(isJobikError({ _tag: 'FlowSaveError' })).toBe(false)
    expect(isJobikError(null)).toBe(false)
  })
})

describe('toWireError — the path-bearing tags', () => {
  it('never forwards the absolute path a $path message interpolates', () => {
    const tagged = [
      new jobik.FlowFileReadError({ path: documentPath }),
      new jobik.FlowSchemaError({ path: documentPath }),
      new jobik.FlowMigrationError({ path: documentPath, from: 0, to: 1 }),
      new jobik.UnsupportedFlowVersionError({ path: documentPath, version: 9, supported: 1 }),
      new jobik.FlowSaveError({ path: documentPath }),
      new jobik.FlowRevisionConflictError({
        path: documentPath,
        expectedRevision: 'aaa',
        actualRevision: 'bbb',
      }),
    ]
    for (const error of tagged) {
      expect(error.message).toContain(documentPath)
      const wire = toWireError(error)
      expect(JSON.stringify(wire)).not.toContain(documentPath)
      expect(JSON.stringify(wire)).not.toContain('/home/dev')
      expect(findUnsafeValues(JSON.parse(JSON.stringify(wire)), [documentPath])).toEqual([])
    }
  })

  it('replaces each with a message that names the problem without the path', () => {
    expect(toWireError(new jobik.FlowFileReadError({ path: documentPath }))).toEqual({
      _tag: 'FlowFileReadError',
      message: 'Cannot read the flow document',
    })
    expect(toWireError(new jobik.FlowSaveError({ path: documentPath }))).toEqual({
      _tag: 'FlowSaveError',
      message: 'Cannot save the flow document',
    })
  })
})

describe('toWireError — declared fields the browser needs', () => {
  it('carries a schema error issue list', () => {
    const wire = toWireError(
      new jobik.FlowSchemaError({
        path: documentPath,
        issues: [{ path: 'connections.0.from', message: 'expected string' }],
      }),
    )
    expect(wire).toEqual({
      _tag: 'FlowSchemaError',
      message: 'The flow document is not a valid jobik.flow document',
      issues: [{ path: 'connections.0.from', message: 'expected string' }],
    })
  })

  it('carries the migration versions', () => {
    expect(
      toWireError(new jobik.FlowMigrationError({ path: documentPath, from: 0, to: 1 })),
    ).toEqual({
      _tag: 'FlowMigrationError',
      message: 'Migrating the flow document from version 0 to version 1 failed',
      from: 0,
      to: 1,
    })
  })

  it('carries the unsupported version pair', () => {
    expect(
      toWireError(
        new jobik.UnsupportedFlowVersionError({ path: documentPath, version: 9, supported: 1 }),
      ),
    ).toEqual({
      _tag: 'UnsupportedFlowVersionError',
      message: 'The flow document declares version 9; this build reads version 1',
      version: 9,
      supported: 1,
    })
  })

  it('carries both revisions of a conflict, so the UI can offer reload or copy-draft', () => {
    expect(
      toWireError(
        new jobik.FlowRevisionConflictError({
          path: documentPath,
          expectedRevision: 'aaa',
          actualRevision: 'bbb',
        }),
      ),
    ).toEqual({
      _tag: 'FlowRevisionConflictError',
      message: 'The flow document changed on disk: expected revision aaa but found bbb',
      expectedRevision: 'aaa',
      actualRevision: 'bbb',
    })
  })

  it('carries a connection error whole: reason, both ends and the cycle', () => {
    expect(
      toWireError(
        new jobik.ConnectionError({
          reason: "node 'render' has no input field 'width'",
          from: { node: 'start1', field: 'title' },
          to: { node: 'render', field: 'width' },
          cycle: ['a', 'b', 'a'],
        }),
      ),
    ).toEqual({
      _tag: 'ConnectionError',
      message: "The flow graph is invalid: node 'render' has no input field 'width'",
      from: { node: 'start1', field: 'title' },
      to: { node: 'render', field: 'width' },
      cycle: ['a', 'b', 'a'],
    })
  })

  it('carries the editor-schema error the browser shows on a broken node', () => {
    expect(
      toWireError(
        new jobik.JobUiSchemaError({
          nodeId: 'render',
          field: 'when',
          reason: 'Date cannot be represented in JSON Schema at #/properties/when',
          io: 'input',
        }),
      ),
    ).toEqual({
      _tag: 'JobUiSchemaError',
      message:
        'Cannot derive an editor schema for field when of node render: Date cannot be represented in JSON Schema at #/properties/when',
      nodeId: 'render',
      field: 'when',
      io: 'input',
    })
  })

  it('projects the run-side tags P13 extends, without frames', () => {
    expect(
      toWireError(
        new jobik.NodeExecutionError({
          nodeId: 'render',
          runNumber: 219,
          frames: [{ fn: 'raster', file: '/home/dev/nodes/imageOut.ts', line: 61 }],
          hiddenFrames: 4,
        }),
      ),
    ).toEqual({
      _tag: 'NodeExecutionError',
      message: 'Node render failed',
      nodeId: 'render',
      runNumber: 219,
    })
    expect(
      toWireError(
        new jobik.UpstreamFailedError({
          nodeId: 'publish',
          upstreamNodeId: 'render',
          runNumber: 219,
        }),
      ),
    ).toEqual({
      _tag: 'UpstreamFailedError',
      message: 'Node publish was skipped because upstream node render failed',
      nodeId: 'publish',
      upstreamNodeId: 'render',
      runNumber: 219,
    })
    expect(
      toWireError(new jobik.StartNotFoundError({ startId: 'start2', available: ['start1'] })),
    ).toEqual({
      _tag: 'StartNotFoundError',
      message: 'This flow declares no start named start2',
      startId: 'start2',
      available: ['start1'],
    })
    expect(
      toWireError(
        new jobik.RunInputError({
          startId: 'start1',
          issues: [{ path: 'title', message: 'expected string' }],
        }),
      ),
    ).toEqual({
      _tag: 'RunInputError',
      message: 'The run input for start start1 does not match its schema',
      startId: 'start1',
      issues: [{ path: 'title', message: 'expected string' }],
    })
    expect(toWireError(new jobik.RunCancelledError({ runNumber: 219 }))).toEqual({
      _tag: 'RunCancelledError',
      message: 'The run was cancelled',
      runNumber: 219,
    })
  })
})

describe('toWireError — what never crosses', () => {
  it('drops the cause chain entirely, including its message', () => {
    const cause = new Error("ENOENT: no such file or directory, open '/home/dev/secret/flow.json'")
    const wire = toWireError(new jobik.FlowSchemaError({ path: documentPath, cause }))
    const text = JSON.stringify(wire)
    expect(text).not.toContain('ENOENT')
    expect(text).not.toContain('secret')
    expect(text).not.toContain('cause')
  })

  it('drops the stack, and never uses errore toJSON', () => {
    const error = new jobik.FlowSaveError({ path: documentPath })
    expect(JSON.stringify(error.toJSON())).toContain('stack')
    expect(JSON.stringify(toWireError(error))).not.toContain('stack')
  })

  it('never emits a frames array — that is P13 extending this projection', () => {
    const wire = toWireError(
      new jobik.NodeExecutionError({
        nodeId: 'render',
        runNumber: 219,
        frames: [{ fn: 'raster', file: '/home/dev/nodes/imageOut.ts', line: 61 }],
      }),
    )
    expect('frames' in wire).toBe(false)
    expect(JSON.stringify(wire)).not.toContain('imageOut.ts')
  })

  it('covers every tag the taxonomy declares', () => {
    expect(jobik.jobikErrorTags).toHaveLength(13)
    for (const tag of jobik.jobikErrorTags) {
      const status = wireErrorStatus(tag)
      expect(Number.isInteger(status)).toBe(true)
      expect(status).toBeGreaterThanOrEqual(400)
      expect(status).toBeLessThanOrEqual(599)
      // Construct a minimal error of each tag and verify it projects
      const wire = constructAndProject(tag)
      expect(wire._tag).toBe(tag)
    }
  })
})

describe('toWireErrorBody', () => {
  it('wraps a tagged error', () => {
    expect(toWireErrorBody(new jobik.FlowSaveError({ path: documentPath }))).toEqual({
      error: { _tag: 'FlowSaveError', message: 'Cannot save the flow document' },
    })
  })

  it('turns anything untagged into a constant, inspecting nothing', () => {
    const body = toWireErrorBody(new Error("ENOENT: open '/home/dev/secret'"))
    expect(body).toEqual({ error: { _tag: null, message: WIRE_MESSAGES.internal } })
    expect(JSON.stringify(body)).not.toContain('secret')
  })

  it('builds an untagged body from the closed message set', () => {
    expect(untaggedWireErrorBody(WIRE_MESSAGES.flowNotFound)).toEqual({
      error: { _tag: null, message: 'No such flow' },
    })
  })
})

describe('wireErrorStatus', () => {
  it('maps a revision conflict to 409 and a save failure to 500', () => {
    expect(wireErrorStatus('FlowRevisionConflictError')).toBe(409)
    expect(wireErrorStatus('FlowSaveError')).toBe(500)
  })

  it('maps the two client-content failures to 422', () => {
    expect(wireErrorStatus('FlowSchemaError')).toBe(422)
    expect(wireErrorStatus('ConnectionError')).toBe(422)
  })
})

/**
 * Helper to construct and project a minimal error for each tag.
 * Used in the "covers every tag" test.
 */
function constructAndProject(tag: jobik.JobikErrorTag) {
  const docPath = '/test/path.json'
  switch (tag) {
    case 'FlowFileReadError':
      return toWireError(new jobik.FlowFileReadError({ path: docPath }))
    case 'FlowSchemaError':
      return toWireError(new jobik.FlowSchemaError({ path: docPath }))
    case 'FlowMigrationError':
      return toWireError(new jobik.FlowMigrationError({ path: docPath, from: 0, to: 1 }))
    case 'UnsupportedFlowVersionError':
      return toWireError(
        new jobik.UnsupportedFlowVersionError({ path: docPath, version: 1, supported: 0 }),
      )
    case 'ConnectionError':
      return toWireError(new jobik.ConnectionError({ reason: 'test' }))
    case 'StartNotFoundError':
      return toWireError(new jobik.StartNotFoundError({ startId: 'start1' }))
    case 'RunInputError':
      return toWireError(new jobik.RunInputError({ startId: 'start1' }))
    case 'NodeExecutionError':
      return toWireError(new jobik.NodeExecutionError({ nodeId: 'node1', runNumber: 1 }))
    case 'UpstreamFailedError':
      return toWireError(
        new jobik.UpstreamFailedError({ nodeId: 'node1', upstreamNodeId: 'node0', runNumber: 1 }),
      )
    case 'FlowSaveError':
      return toWireError(new jobik.FlowSaveError({ path: docPath }))
    case 'FlowRevisionConflictError':
      return toWireError(
        new jobik.FlowRevisionConflictError({
          path: docPath,
          expectedRevision: 'a',
          actualRevision: 'b',
        }),
      )
    case 'JobUiSchemaError':
      return toWireError(
        new jobik.JobUiSchemaError({
          nodeId: 'node1',
          field: 'input',
          reason: 'test',
          io: 'input',
        }),
      )
    case 'RunCancelledError':
      return toWireError(new jobik.RunCancelledError({ runNumber: 1 }))
  }
}
