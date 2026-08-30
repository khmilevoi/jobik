import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  FlowFileReadError,
  FlowMigrationError,
  FlowSchemaError,
  UnsupportedFlowVersionError,
} from '../errors.js'
import type { FlowMigration } from './migrate.js'
import { readFlowDocument } from './read.js'
import { revisionOf } from './revision.js'

let directory: string
let documentPath: string

const specExampleText = `{
  "format": "jobik.flow",
  "version": 1,
  "connections": [
    {
      "from": { "node": "start1", "field": "markdown" },
      "to": { "node": "render", "field": "markdown" }
    }
  ],
  "literals": { "render": {} },
  "layout": {
    "start1": { "x": 80, "y": 160 },
    "render": { "x": 420, "y": 160 }
  }
}
`

const v0ToV1: FlowMigration = {
  from: 0,
  migrate: (document) => ({
    format: 'jobik.flow',
    connections: document.edges,
    literals: {},
    layout: document.positions,
  }),
}

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jobik-read-'))
  documentPath = path.join(directory, 'flow.jobik.json')
})

afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true })
})

describe('readFlowDocument', () => {
  it('reads the document the spec documents, with the revision of the bytes on disk', async () => {
    await fs.writeFile(documentPath, specExampleText, 'utf8')
    const result = await readFlowDocument({ path: documentPath })
    expect(result).not.toBeInstanceOf(Error)
    if (result instanceof Error) throw new Error('unreachable')
    expect(result.document).toEqual({
      format: 'jobik.flow',
      version: 1,
      connections: [
        { from: { node: 'start1', field: 'markdown' }, to: { node: 'render', field: 'markdown' } },
      ],
      literals: { render: {} },
      layout: { start1: { x: 80, y: 160 }, render: { x: 420, y: 160 } },
    })
    expect(result.revision).toBe(revisionOf(specExampleText))
  })

  it('returns FlowFileReadError when the file is absent', async () => {
    const absent = path.join(directory, 'absent.jobik.json')
    const result = await readFlowDocument({ path: absent })
    expect(result).toBeInstanceOf(FlowFileReadError)
    if (!(result instanceof FlowFileReadError)) throw new Error('unreachable')
    expect(result.path).toBe(absent)
    expect(result.cause).toMatchObject({ code: 'ENOENT' })
  })

  it('returns FlowSchemaError with the syntax error as cause for malformed json', async () => {
    await fs.writeFile(documentPath, '{ "format": "jobik.flow", ', 'utf8')
    const result = await readFlowDocument({ path: documentPath })
    expect(result).toBeInstanceOf(FlowSchemaError)
    if (!(result instanceof FlowSchemaError)) throw new Error('unreachable')
    expect(result.path).toBe(documentPath)
    expect(result.issues).toEqual([])
    expect(result.cause).toBeInstanceOf(SyntaxError)
  })

  it('tolerates a utf-8 byte order mark and still hashes the raw bytes', async () => {
    const text = '{"format":"jobik.flow","version":1}\n'
    await fs.writeFile(documentPath, `\uFEFF${text}`, 'utf8')
    const result = await readFlowDocument({ path: documentPath })
    expect(result).not.toBeInstanceOf(Error)
    if (result instanceof Error) throw new Error('unreachable')
    expect(result.document.connections).toEqual([])
    expect(result.revision).toBe(revisionOf(Buffer.from(`\uFEFF${text}`, 'utf8')))
    expect(result.revision).not.toBe(revisionOf(text))
  })

  it('migrates an older document on read', async () => {
    await fs.writeFile(
      documentPath,
      JSON.stringify({ format: 'jobik.flow', version: 0, edges: [], positions: {} }),
      'utf8',
    )
    const result = await readFlowDocument({ path: documentPath, migrations: [v0ToV1] })
    expect(result).not.toBeInstanceOf(Error)
    if (result instanceof Error) throw new Error('unreachable')
    expect(result.document.version).toBe(1)
  })

  it('returns UnsupportedFlowVersionError for a version from the future', async () => {
    await fs.writeFile(documentPath, '{"format":"jobik.flow","version":42}', 'utf8')
    expect(await readFlowDocument({ path: documentPath })).toBeInstanceOf(
      UnsupportedFlowVersionError,
    )
  })

  it('returns FlowMigrationError when a step fails', async () => {
    await fs.writeFile(documentPath, '{"format":"jobik.flow","version":0}', 'utf8')
    const result = await readFlowDocument({
      path: documentPath,
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

  it('reports the same revision twice, and a different one after a whitespace edit', async () => {
    await fs.writeFile(documentPath, specExampleText, 'utf8')
    const first = await readFlowDocument({ path: documentPath })
    const second = await readFlowDocument({ path: documentPath })
    if (first instanceof Error || second instanceof Error) throw new Error('unreachable')
    expect(second.revision).toBe(first.revision)
    await fs.writeFile(documentPath, `${specExampleText}\n`, 'utf8')
    const third = await readFlowDocument({ path: documentPath })
    if (third instanceof Error) throw new Error('unreachable')
    expect(third.revision).not.toBe(first.revision)
    expect(third.document).toEqual(first.document)
  })
})
