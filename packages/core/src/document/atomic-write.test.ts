import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FlowSaveError } from '../errors.js'
import { writeFileAtomic } from './atomic-write.js'
import { readFlowDocument } from './read.js'
import { revisionOf } from './revision.js'
import { flowDocumentSchema, serializeFlowDocument } from './schema.js'

let directory: string
let documentPath: string

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jobik-write-'))
  documentPath = path.join(directory, 'flow.jobik.json')
})

afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true })
})

const temporaries = async (): Promise<string[]> =>
  (await fs.readdir(directory)).filter((entry) => entry.endsWith('.tmp'))

describe('writeFileAtomic', () => {
  it('writes a new file and returns nothing', async () => {
    expect(await writeFileAtomic({ path: documentPath, contents: 'first' })).toBeUndefined()
    expect(await fs.readFile(documentPath, 'utf8')).toBe('first')
  })

  it('replaces an existing file', async () => {
    await fs.writeFile(documentPath, 'old', 'utf8')
    expect(await writeFileAtomic({ path: documentPath, contents: 'new' })).toBeUndefined()
    expect(await fs.readFile(documentPath, 'utf8')).toBe('new')
  })

  it('leaves no temporary file behind on success', async () => {
    await writeFileAtomic({ path: documentPath, contents: 'first' })
    await writeFileAtomic({ path: documentPath, contents: 'second' })
    expect(await temporaries()).toEqual([])
    expect(await fs.readdir(directory)).toEqual(['flow.jobik.json'])
  })

  it('returns FlowSaveError when the directory does not exist', async () => {
    const target = path.join(directory, 'missing', 'flow.jobik.json')
    const result = await writeFileAtomic({ path: target, contents: 'x' })
    expect(result).toBeInstanceOf(FlowSaveError)
    if (!(result instanceof FlowSaveError)) throw new Error('unreachable')
    expect(result._tag).toBe('FlowSaveError')
    expect(result.path).toBe(target)
    expect(result.cause).toMatchObject({ code: 'ENOENT' })
  })

  it('returns FlowSaveError and cleans up when the target cannot be replaced', async () => {
    const target = path.join(directory, 'a-directory')
    await fs.mkdir(target)
    const result = await writeFileAtomic({ path: target, contents: 'x' })
    expect(result).toBeInstanceOf(FlowSaveError)
    expect(await temporaries()).toEqual([])
  })

  it('produces a file that reads back as the same document, at a revision the writer can predict', async () => {
    const contents = serializeFlowDocument(
      flowDocumentSchema.parse({
        format: 'jobik.flow',
        version: 1,
        connections: [
          {
            from: { node: 'start1', field: 'markdown' },
            to: { node: 'render', field: 'markdown' },
          },
        ],
        literals: { render: {} },
        layout: { start1: { x: 80, y: 160 }, render: { x: 420, y: 160 } },
      }),
    )
    expect(await writeFileAtomic({ path: documentPath, contents })).toBeUndefined()
    const result = await readFlowDocument({ path: documentPath })
    if (result instanceof Error) throw new Error('unreachable')
    expect(serializeFlowDocument(result.document)).toBe(contents)
    expect(result.revision).toBe(revisionOf(contents))
  })
})
