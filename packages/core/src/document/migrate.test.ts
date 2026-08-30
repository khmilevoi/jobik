import { describe, expect, it } from 'vitest'
import { FlowMigrationError, UnsupportedFlowVersionError } from '../errors.js'
import { type FlowMigration, flowMigrations, migrateFlowDocument } from './migrate.js'
import { CURRENT_FLOW_VERSION, type FlowDocumentEnvelope } from './schema.js'

const documentPath = '/flows/publication/flow.jobik.json'

/**
 * The only migration step that exists anywhere: v1 is the only version this build has ever
 * written, so the pipeline is proven with a test-only v0 shape whose `edges` and `positions` keys
 * became `connections` and `layout`.
 */
const v0ToV1: FlowMigration = {
  from: 0,
  migrate: (document) => ({
    format: 'jobik.flow',
    connections: document.edges,
    literals: {},
    layout: document.positions,
  }),
}

const v0: FlowDocumentEnvelope = {
  format: 'jobik.flow',
  version: 0,
  edges: [{ from: { node: 'a', field: 'x' }, to: { node: 'b', field: 'y' } }],
  positions: { a: { x: 1, y: 2 } },
}

const v1: FlowDocumentEnvelope = {
  format: 'jobik.flow',
  version: 1,
  connections: [],
  literals: {},
  layout: {},
}

describe('flowMigrations', () => {
  it('ships empty because v1 is the only version this build has written', () => {
    expect(flowMigrations).toEqual([])
    expect(CURRENT_FLOW_VERSION).toBe(1)
  })
})

describe('migrateFlowDocument', () => {
  it('returns a current-version document untouched', () => {
    expect(migrateFlowDocument({ path: documentPath, document: v1 })).toEqual(v1)
  })

  it('runs a registered step and stamps the new version', () => {
    const result = migrateFlowDocument({
      path: documentPath,
      document: v0,
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

  it('refuses a version from the future', () => {
    const result = migrateFlowDocument({
      path: documentPath,
      document: { ...v1, version: 7 },
    })
    expect(result).toBeInstanceOf(UnsupportedFlowVersionError)
    if (!(result instanceof UnsupportedFlowVersionError)) throw new Error('unreachable')
    expect(result._tag).toBe('UnsupportedFlowVersionError')
    expect(result.path).toBe(documentPath)
    expect(result.version).toBe(7)
    expect(result.supported).toBe(1)
  })

  it('refuses an old version the registry cannot reach', () => {
    const result = migrateFlowDocument({ path: documentPath, document: v0 })
    expect(result).toBeInstanceOf(UnsupportedFlowVersionError)
    if (!(result instanceof UnsupportedFlowVersionError)) throw new Error('unreachable')
    expect(result.version).toBe(0)
    expect(result.supported).toBe(1)
  })

  it('wraps a step that throws', () => {
    const boom = new TypeError('cannot read properties of undefined')
    const result = migrateFlowDocument({
      path: documentPath,
      document: v0,
      migrations: [
        {
          from: 0,
          migrate: () => {
            throw boom
          },
        },
      ],
    })
    expect(result).toBeInstanceOf(FlowMigrationError)
    if (!(result instanceof FlowMigrationError)) throw new Error('unreachable')
    expect(result._tag).toBe('FlowMigrationError')
    expect(result.path).toBe(documentPath)
    expect(result.from).toBe(0)
    expect(result.to).toBe(1)
    expect(result.cause).toBe(boom)
  })

  it('wraps a step that returns an error value', () => {
    const failure = new Error('this document predates connections')
    const result = migrateFlowDocument({
      path: documentPath,
      document: v0,
      migrations: [{ from: 0, migrate: () => failure }],
    })
    expect(result).toBeInstanceOf(FlowMigrationError)
    if (!(result instanceof FlowMigrationError)) throw new Error('unreachable')
    expect(result.cause).toBe(failure)
  })

  it('wraps a step that returns something that is not a flow document', () => {
    for (const output of [42, null, 'nope', { format: 'other.format' }]) {
      const result = migrateFlowDocument({
        path: documentPath,
        document: v0,
        migrations: [{ from: 0, migrate: () => output }],
      })
      expect(result).toBeInstanceOf(FlowMigrationError)
    }
  })

  it('stamps the version even when the step left the old one in place', () => {
    const result = migrateFlowDocument({
      path: documentPath,
      document: v0,
      migrations: [{ from: 0, migrate: (document) => ({ ...document, version: 0 }) }],
    })
    expect(result).toMatchObject({ version: 1 })
  })
})
