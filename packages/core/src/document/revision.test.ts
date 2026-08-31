import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FlowFileReadError } from '#errors.js'
import { readFlowRevision, revisionOf } from './revision.js'

let directory: string

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'jobik-revision-'))
})

afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true })
})

describe('revisionOf', () => {
  it('is a stable lowercase sha256 hex digest', () => {
    const first = revisionOf('{"format":"jobik.flow"}')
    const second = revisionOf('{"format":"jobik.flow"}')
    expect(first).toBe(second)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
  })

  it('hashes a string and its utf-8 bytes identically', () => {
    const text = '{"format":"jobik.flow","version":1}\n'
    expect(revisionOf(text)).toBe(revisionOf(Buffer.from(text, 'utf8')))
  })

  it('changes when only whitespace changes', () => {
    expect(revisionOf('{"a":1}')).not.toBe(revisionOf('{"a":1} '))
    expect(revisionOf('{"a":1}')).not.toBe(revisionOf('{"a": 1}'))
  })
})

describe('readFlowRevision', () => {
  it('returns the revision of the bytes on disk', async () => {
    const file = path.join(directory, 'flow.jobik.json')
    const contents = '{"format":"jobik.flow","version":1}\n'
    await fs.writeFile(file, contents, 'utf8')
    await expect(readFlowRevision({ path: file })).resolves.toBe(revisionOf(contents))
  })

  it('returns FlowFileReadError for a missing file instead of throwing', async () => {
    const file = path.join(directory, 'absent.jobik.json')
    const result = await readFlowRevision({ path: file })
    expect(result).toBeInstanceOf(FlowFileReadError)
    if (!(result instanceof FlowFileReadError)) throw new Error('unreachable')
    expect(result._tag).toBe('FlowFileReadError')
    expect(result.path).toBe(file)
    expect(result.cause).toMatchObject({ code: 'ENOENT' })
  })
})
