import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { readFlowDocument } from '@jobik/core'
import { afterEach, describe, expect, it } from 'vitest'
import {
  bindPublicationTo,
  createPublicationDocumentCopy,
  publicationExpectedCaption,
  publicationExpectedUrlPattern,
  publicationFixture,
  publicationSampleInput,
} from './fixtures.js'
import { publication } from './index.js'

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop()
    if (cleanup) await cleanup()
  }
})

describe('publicationFixture', () => {
  it('exposes absolute paths that exist', async () => {
    for (const target of [
      publicationFixture.root,
      publicationFixture.bindingPath,
      publicationFixture.documentPath,
    ]) {
      expect(path.isAbsolute(target)).toBe(true)
      await expect(fs.access(target)).resolves.toBeUndefined()
    }
  })

  it('agrees with the bound flow', () => {
    expect(publicationFixture.documentPath).toBe(publication.path)
    expect(publicationFixture.flowName).toBe(publication.name)
    expect([...publicationFixture.nodeIds]).toEqual(Object.keys(publication.nodes))
  })
})

describe('publicationSampleInput', () => {
  it('is accepted by the start schema', () => {
    expect(publication.nodes.start1.input.safeParse(publicationSampleInput).success).toBe(true)
  })

  it('drives the flow to the values the artboards fix', async () => {
    const context = { signal: new AbortController().signal, log: () => {} }
    const rendered = await publication.nodes.render.run(publicationSampleInput, context)
    if (rendered instanceof Error) throw rendered
    expect(rendered.caption).toBe(publicationExpectedCaption)

    const published = await publication.nodes.publish.run(rendered, context)
    if (published instanceof Error) throw published
    expect(published.url).toMatch(publicationExpectedUrlPattern)
  })
})

describe('bindPublicationTo()', () => {
  it('binds the same graph to another absolute path', async () => {
    const copy = await createPublicationDocumentCopy()
    cleanups.push(copy.cleanup)
    const bound = bindPublicationTo(copy.documentPath)
    expect(bound.path).toBe(copy.documentPath)
    expect(Object.keys(bound.nodes)).toEqual([...publicationFixture.nodeIds])
  })

  it('rejects a relative path', () => {
    expect(() => bindPublicationTo('flow.jobik.json')).toThrow(TypeError)
  })
})

describe('createPublicationDocumentCopy()', () => {
  it('produces a readable copy outside the repository', async () => {
    const copy = await createPublicationDocumentCopy()
    cleanups.push(copy.cleanup)
    expect(copy.documentPath).not.toBe(publicationFixture.documentPath)
    const file = await readFlowDocument({ path: copy.documentPath })
    expect(file).not.toBeInstanceOf(Error)
  })

  it('is writable without touching the committed document', async () => {
    const before = await fs.readFile(publicationFixture.documentPath, 'utf8')
    const copy = await createPublicationDocumentCopy()
    cleanups.push(copy.cleanup)
    await fs.writeFile(copy.documentPath, '{"format":"jobik.flow","version":1}\n', 'utf8')
    expect(await fs.readFile(publicationFixture.documentPath, 'utf8')).toBe(before)
  })

  it('removes its directory on cleanup', async () => {
    const copy = await createPublicationDocumentCopy()
    await copy.cleanup()
    await expect(fs.access(copy.directory)).rejects.toThrow()
  })
})
