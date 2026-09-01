import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FlowSaveError } from '#errors.js'
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

describe('writeFileAtomic — orphaned temporaries', () => {
  /** A temporary shaped exactly like one `writeFileAtomic` abandons, aged to order. */
  const orphan = async (ageMs: number, target = 'flow.jobik.json'): Promise<string> => {
    const name = `.${target}.${randomUUID()}.tmp`
    const at = path.join(directory, name)
    await fs.writeFile(at, 'abandoned', 'utf8')
    const when = new Date(Date.now() - ageMs)
    await fs.utimes(at, when, when)
    return name
  }

  it('removes a temporary an earlier crash left behind', async () => {
    // The only way one survives: a process stopped between `fs.open` and `fs.rename`. The
    // `catch` cannot cover that, and no `finally` can either, so nothing else ever collects it.
    const stale = await orphan(2 * 60 * 60 * 1000)
    expect(await temporaries()).toEqual([stale])

    expect(await writeFileAtomic({ path: documentPath, contents: 'new' })).toBeUndefined()

    expect(await temporaries()).toEqual([])
    expect(await fs.readFile(documentPath, 'utf8')).toBe('new')
  })

  it('leaves a temporary young enough to belong to a write still in flight', async () => {
    // A concurrent writer — another process, or this one saving twice — owns this file and is
    // about to rename it. Deleting it would destroy a save that is going to succeed.
    const live = await orphan(5_000)

    expect(await writeFileAtomic({ path: documentPath, contents: 'new' })).toBeUndefined()

    expect(await temporaries()).toEqual([live])
  })

  it("touches nothing that is not one of this document's own temporaries", async () => {
    const other = await orphan(2 * 60 * 60 * 1000, 'other.jobik.json')
    const notATemporary = path.join(directory, '.flow.jobik.json.backup')
    await fs.writeFile(notATemporary, 'keep', 'utf8')
    const wrongShape = path.join(directory, '.flow.jobik.json.short.tmp')
    await fs.writeFile(wrongShape, 'keep', 'utf8')
    const when = new Date(Date.now() - 2 * 60 * 60 * 1000)
    await fs.utimes(wrongShape, when, when)

    expect(await writeFileAtomic({ path: documentPath, contents: 'new' })).toBeUndefined()

    expect((await fs.readdir(directory)).sort()).toEqual(
      [other, '.flow.jobik.json.backup', '.flow.jobik.json.short.tmp', 'flow.jobik.json'].sort(),
    )
  })
})

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

  it('replaces the target while a concurrent reader is holding it open', async () => {
    await fs.writeFile(documentPath, 'old', 'utf8')
    // A reader that overlaps the save: `readFlowDocument` at the head of every run, an editor, a
    // scanner. Windows refuses to rename over a handle that was not opened `FILE_SHARE_DELETE`, and
    // libuv never opens with it, so the rename answers EPERM until this handle goes away.
    const handle = await fs.open(documentPath, 'r')
    const released = new Promise<void>((resolve) => {
      setTimeout(() => void handle.close().then(resolve, () => resolve()), 25)
    })

    const result = await writeFileAtomic({ path: documentPath, contents: 'new' })
    await released

    expect(result).toBeUndefined()
    expect(await fs.readFile(documentPath, 'utf8')).toBe('new')
    expect(await temporaries()).toEqual([])
  })

  it.runIf(process.platform === 'win32')(
    'bounds the retrying and keeps the old bytes when the reader never lets go',
    async () => {
      await fs.writeFile(documentPath, 'old', 'utf8')
      const handle = await fs.open(documentPath, 'r')
      try {
        const startedAt = Date.now()
        const result = await writeFileAtomic({ path: documentPath, contents: 'new' })

        expect(result).toBeInstanceOf(FlowSaveError)
        // The budget is ~1.5s of backoff; anything near the 20s test timeout would be a hang.
        expect(Date.now() - startedAt).toBeLessThan(3_000)
        expect(await fs.readFile(documentPath, 'utf8')).toBe('old')
        expect(await temporaries()).toEqual([])
      } finally {
        await handle.close()
      }
    },
  )

  // `DEFERRED.md` §4 drives `FlowSaveError` through a real save by making the target read-only, so
  // that case must keep failing. It is also the case the retry loop short-circuits: a target we
  // cannot write answers the same code forever. Only the outcome is asserted — the elapsed time is
  // too noisy on Windows to bound meaningfully.
  it.runIf(process.platform === 'win32')(
    'still fails on a read-only target, which no amount of retrying can replace',
    async () => {
      await fs.writeFile(documentPath, 'old', 'utf8')
      await fs.chmod(documentPath, 0o444)
      try {
        const result = await writeFileAtomic({ path: documentPath, contents: 'new' })

        expect(result).toBeInstanceOf(FlowSaveError)
        expect(await fs.readFile(documentPath, 'utf8')).toBe('old')
        expect(await temporaries()).toEqual([])
      } finally {
        await fs.chmod(documentPath, 0o666)
      }
    },
  )

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
