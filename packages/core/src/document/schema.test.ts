import { describe, expect, it } from 'vitest'
import type { FieldRef } from '#errors.js'
import {
  CURRENT_FLOW_VERSION,
  FLOW_DOCUMENT_FORMAT,
  type FlowConnection,
  flowDocumentSchema,
  flowEnvelopeSchema,
  serializeFlowDocument,
  toSchemaIssues,
} from './schema.js'

const specExample = {
  format: 'jobik.flow',
  version: 1,
  connections: [
    {
      from: { node: 'start1', field: 'markdown' },
      to: { node: 'render', field: 'markdown' },
    },
  ],
  literals: { render: {} },
  layout: {
    start1: { x: 80, y: 160 },
    render: { x: 420, y: 160 },
  },
}

describe('flow document schema', () => {
  it('names the format and the current version', () => {
    expect(FLOW_DOCUMENT_FORMAT).toBe('jobik.flow')
    expect(CURRENT_FLOW_VERSION).toBe(1)
  })

  it('parses the document shape the spec documents', () => {
    expect(flowDocumentSchema.parse(specExample)).toEqual(specExample)
  })

  it('defaults connections, literals and layout to empty', () => {
    expect(flowDocumentSchema.parse({ format: 'jobik.flow', version: 1 })).toEqual({
      format: 'jobik.flow',
      version: 1,
      connections: [],
      literals: {},
      layout: {},
    })
  })

  it('never lets a document carry node definitions, handlers or starts', () => {
    const result = flowDocumentSchema.safeParse({ ...specExample, nodes: [{ id: 'render' }] })
    if (result.success) throw new Error('expected the document to be rejected')
    const issues = toSchemaIssues(result.error)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.path).toBe('')
    expect(issues[0]?.message).toContain('Unrecognized key')
  })

  it('rejects a foreign format', () => {
    const result = flowDocumentSchema.safeParse({ ...specExample, format: 'something.else' })
    if (result.success) throw new Error('expected the document to be rejected')
    expect(toSchemaIssues(result.error)[0]?.path).toBe('format')
  })

  it('rejects a document that is not at the current version', () => {
    const result = flowDocumentSchema.safeParse({ ...specExample, version: 2 })
    if (result.success) throw new Error('expected the document to be rejected')
    expect(toSchemaIssues(result.error)[0]?.path).toBe('version')
  })

  it('rejects an empty endpoint identifier', () => {
    const result = flowDocumentSchema.safeParse({
      ...specExample,
      connections: [
        { from: { node: '', field: 'markdown' }, to: { node: 'render', field: 'markdown' } },
      ],
    })
    if (result.success) throw new Error('expected the document to be rejected')
    expect(toSchemaIssues(result.error)[0]?.path).toBe('connections.0.from.node')
  })

  it('reports a nested layout failure with a dotted path', () => {
    const result = flowDocumentSchema.safeParse({ ...specExample, layout: { render: { x: 1 } } })
    if (result.success) throw new Error('expected the document to be rejected')
    const issues = toSchemaIssues(result.error)
    expect(issues[0]?.path).toBe('layout.render.y')
    expect(issues[0]?.message).toContain('expected number')
  })

  it('keeps literal values verbatim, including null', () => {
    const document = flowDocumentSchema.parse({
      format: 'jobik.flow',
      version: 1,
      literals: { render: { title: 'hi', count: 3, nothing: null, nested: { a: [1, 2] } } },
    })
    expect(document.literals.render).toEqual({
      title: 'hi',
      count: 3,
      nothing: null,
      nested: { a: [1, 2] },
    })
  })

  it('gives connection endpoints the taxonomy FieldRef shape', () => {
    const connection: FlowConnection = {
      from: { node: 'start1', field: 'markdown' },
      to: { node: 'render', field: 'markdown' },
    }
    const from: FieldRef = connection.from
    const to: FieldRef = connection.to
    expect(from.node).toBe('start1')
    expect(to.field).toBe('markdown')
  })
})

describe('flow envelope schema', () => {
  it('accepts any integer version and keeps the rest of the document', () => {
    expect(flowEnvelopeSchema.parse({ format: 'jobik.flow', version: 0, edges: [] })).toEqual({
      format: 'jobik.flow',
      version: 0,
      edges: [],
    })
  })

  it('rejects a value that is not an object', () => {
    for (const value of [null, [], 'x', 7]) {
      const result = flowEnvelopeSchema.safeParse(value)
      if (result.success) throw new Error('expected the value to be rejected')
      expect(toSchemaIssues(result.error)[0]?.path).toBe('')
    }
  })

  it('rejects a fractional version', () => {
    const result = flowEnvelopeSchema.safeParse({ format: 'jobik.flow', version: 1.5 })
    if (result.success) throw new Error('expected the value to be rejected')
    expect(toSchemaIssues(result.error)[0]?.path).toBe('version')
  })
})

describe('serializeFlowDocument', () => {
  it('writes the spec key order, two-space indent and a trailing newline', () => {
    const document = flowDocumentSchema.parse(specExample)
    const text = serializeFlowDocument(document)
    expect(text.endsWith('\n')).toBe(true)
    expect(text.split('\n')[1]).toBe('  "format": "jobik.flow",')
    expect(Object.keys(JSON.parse(text))).toEqual([
      'format',
      'version',
      'connections',
      'literals',
      'layout',
    ])
  })

  it('round-trips through the schema and is stable', () => {
    const document = flowDocumentSchema.parse(specExample)
    const once = serializeFlowDocument(document)
    const reparsed = flowDocumentSchema.parse(JSON.parse(once))
    expect(reparsed).toEqual(document)
    expect(serializeFlowDocument(reparsed)).toBe(once)
  })

  it('always writes the current format and version', () => {
    const document = flowDocumentSchema.parse({ format: 'jobik.flow', version: 1 })
    expect(JSON.parse(serializeFlowDocument(document))).toEqual({
      format: 'jobik.flow',
      version: 1,
      connections: [],
      literals: {},
      layout: {},
    })
  })
})
