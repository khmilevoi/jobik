import { describe, expect, it } from 'vitest'
import { FlowMigrationError, FlowSchemaError, UnsupportedFlowVersionError } from '../errors.js'
import type { FlowMigration } from './migrate.js'
import { parseFlowDocument } from './parse.js'

const documentPath = '/flows/publication/flow.jobik.json'

const specExample = {
  format: 'jobik.flow',
  version: 1,
  connections: [
    { from: { node: 'start1', field: 'markdown' }, to: { node: 'render', field: 'markdown' } },
  ],
  literals: { render: {} },
  layout: { start1: { x: 80, y: 160 }, render: { x: 420, y: 160 } },
}

const v0ToV1: FlowMigration = {
  from: 0,
  migrate: (document) => ({
    format: 'jobik.flow',
    connections: document.edges,
    literals: {},
    layout: document.positions,
  }),
}

describe('parseFlowDocument', () => {
  it('returns the validated document for a current-version value', () => {
    expect(parseFlowDocument({ path: documentPath, value: specExample })).toEqual(specExample)
  })

  it('returns FlowSchemaError for a value that is not an object', () => {
    const result = parseFlowDocument({ path: documentPath, value: null })
    expect(result).toBeInstanceOf(FlowSchemaError)
    if (!(result instanceof FlowSchemaError)) throw new Error('unreachable')
    expect(result._tag).toBe('FlowSchemaError')
    expect(result.path).toBe(documentPath)
    expect(result.issues).toHaveLength(1)
    expect(result.issues[0]?.path).toBe('')
    expect(result.cause).toBeInstanceOf(Error)
  })

  it('returns FlowSchemaError when the envelope is missing', () => {
    for (const value of [{}, { format: 'jobik.flow' }, { format: 'other', version: 1 }]) {
      expect(parseFlowDocument({ path: documentPath, value })).toBeInstanceOf(FlowSchemaError)
    }
  })

  it('returns FlowSchemaError with the offending key for an unknown field', () => {
    const result = parseFlowDocument({
      path: documentPath,
      value: { ...specExample, handlers: {} },
    })
    expect(result).toBeInstanceOf(FlowSchemaError)
    if (!(result instanceof FlowSchemaError)) throw new Error('unreachable')
    expect(result.issues[0]?.message).toContain('handlers')
  })

  it('propagates UnsupportedFlowVersionError for a future version', () => {
    const result = parseFlowDocument({
      path: documentPath,
      value: { format: 'jobik.flow', version: 99 },
    })
    expect(result).toBeInstanceOf(UnsupportedFlowVersionError)
  })

  it('migrates before validating', () => {
    const result = parseFlowDocument({
      path: documentPath,
      value: {
        format: 'jobik.flow',
        version: 0,
        edges: [{ from: { node: 'a', field: 'x' }, to: { node: 'b', field: 'y' } }],
        positions: { a: { x: 1, y: 2 } },
      },
      migrations: [v0ToV1],
    })
    expect(result).toEqual({
      format: 'jobik.flow',
      version: 1,
      connections: [{ from: { node: 'a', field: 'x' }, to: { node: 'b', field: 'y' } }],
      literals: {},
      layout: { a: { x: 1, y: 2 } },
    })
  })

  it('validates the migrated document, not the original', () => {
    const result = parseFlowDocument({
      path: documentPath,
      value: { format: 'jobik.flow', version: 0 },
      migrations: [{ from: 0, migrate: () => ({ format: 'jobik.flow', layout: { a: { x: 1 } } }) }],
    })
    expect(result).toBeInstanceOf(FlowSchemaError)
    if (!(result instanceof FlowSchemaError)) throw new Error('unreachable')
    expect(result.issues[0]?.path).toBe('layout.a.y')
  })

  it('propagates FlowMigrationError from a failing step', () => {
    const result = parseFlowDocument({
      path: documentPath,
      value: { format: 'jobik.flow', version: 0 },
      migrations: [
        {
          from: 0,
          migrate: () => {
            throw new Error('boom')
          },
        },
      ],
    })
    expect(result).toBeInstanceOf(FlowMigrationError)
  })
})
