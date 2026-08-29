import * as errore from 'errore'
import { describe, expect, it } from 'vitest'
import {
  ConnectionError,
  FlowMigrationError,
  FlowRevisionConflictError,
  FlowSchemaError,
  JobUiSchemaError,
  jobikErrorTags,
  NodeExecutionError,
  RunCancelledError,
} from './errors.js'

describe('error taxonomy', () => {
  it('declares thirteen unique tags', () => {
    expect(jobikErrorTags).toHaveLength(13)
    expect(new Set(jobikErrorTags).size).toBe(13)
  })

  it('carries a tag, template fields and a cause', () => {
    const cause = new Error('ENOENT')
    const error = new FlowSchemaError({
      path: '/flows/publication/flow.jobik.json',
      issues: [{ path: 'connections.0.from', message: 'expected string' }],
      cause,
    })
    expect(error._tag).toBe('FlowSchemaError')
    expect(error.path).toBe('/flows/publication/flow.jobik.json')
    expect(error.issues).toEqual([{ path: 'connections.0.from', message: 'expected string' }])
    expect(error.cause).toBe(cause)
    expect(error.findCause(Error)).toBeInstanceOf(Error)
  })

  it('keeps numeric fields numeric', () => {
    const error = new FlowMigrationError({ path: '/a.json', from: 0, to: 1 })
    expect(error.from).toBe(0)
    expect(error.to).toBe(1)
  })

  it('defaults optional collection fields to empty', () => {
    const error = new ConnectionError({ reason: 'cycle detected', cycle: ['a', 'b', 'a'] })
    expect(error.from).toBeNull()
    expect(error.to).toBeNull()
    expect(error.cycle).toEqual(['a', 'b', 'a'])
    expect(new NodeExecutionError({ nodeId: 'render', runNumber: 219 }).frames).toEqual([])
  })

  it('narrows a literal union field', () => {
    const error = new JobUiSchemaError({
      nodeId: 'render',
      field: 'markdown',
      reason: 'bigint is not representable',
      io: 'input',
    })
    expect(error.io).toBe('input')
    expect(error.message).toBe(
      'Cannot derive an editor schema for field markdown of node render: bigint is not representable',
    )
  })

  it('interpolates every template variable', () => {
    const error = new FlowRevisionConflictError({
      path: '/a.json',
      expectedRevision: 'aaa',
      actualRevision: 'bbb',
    })
    expect(error.message).toContain('expected revision aaa but found bbb')
  })

  it('reports cancellation as an abort error', () => {
    const error = new RunCancelledError({ runNumber: 219 })
    expect(errore.isAbortError(error)).toBe(true)
    expect(error).toBeInstanceOf(errore.AbortError)
    expect(error.runNumber).toBe(219)
  })
})
