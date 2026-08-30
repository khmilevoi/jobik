import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import { serializeFlowDocument } from '../document/schema.js'
import { ConnectionError, FlowFileReadError, RunInputError, StartNotFoundError } from '../errors.js'
import { flow } from '../flow.js'
import {
  errorOrThrow,
  flowDocument,
  publicationDocument,
  publicationInput,
  publish,
  render,
} from '../graph/fixtures.js'
import * as jobik from '../index.js'
import { start } from '../node.js'
import type { RunReport } from './types.js'

async function boundPublication(document = publicationDocument()) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jobik-run-'))
  const file = path.join(dir, 'flow.jobik.json')
  await fs.writeFile(file, serializeFlowDocument(document), 'utf8')

  return flow('publication')
    .start('start1', publicationInput)
    .node('render', render)
    .node('publish', publish)
    .bind('path', file)
}

function reportOrThrow(result: RunReport | Error): RunReport {
  if (result instanceof Error) throw new Error(`expected a report, received ${result.name}`)
  return result
}

describe('BoundFlow.run()', () => {
  it('loads the document, runs the reachable subgraph and reports it', async () => {
    const publication = await boundPublication()

    const report = reportOrThrow(
      await publication.run('start1', { title: 'A title', markdown: 'hello' }),
    )

    expect(report.flowName).toBe('publication')
    expect(report.startId).toBe('start1')
    expect(report.status).toBe('ok')
    expect(report.nodes.map((node) => node.nodeId)).toEqual(['start1', 'render', 'publish'])
  })

  it('numbers each run of one flow monotonically from one', async () => {
    const publication = await boundPublication()

    const first = reportOrThrow(await publication.run('start1', { title: 't', markdown: 'm' }))
    const second = reportOrThrow(await publication.run('start1', { title: 't', markdown: 'm' }))

    expect(first.runNumber).toBe(1)
    expect(second.runNumber).toBe(2)
  })

  it('returns RunInputError with flattened issues when the input does not match the start', async () => {
    const publication = await boundPublication()

    const result = await publication.run('start1', {
      title: 'A title',
      markdown: 42,
    } as unknown as { title: string; markdown: string })

    const error = errorOrThrow(result, RunInputError)
    expect(error.startId).toBe('start1')
    expect(error.issues.map((issue) => issue.path)).toEqual(['markdown'])
  })

  it('returns StartNotFoundError for a start the flow does not declare', async () => {
    const publication = await boundPublication()

    // The cast goes through `unknown`: two different string literal types never overlap.
    const result = await publication.run('nope' as unknown as 'start1', {
      title: 't',
      markdown: 'm',
    })

    expect(errorOrThrow(result, StartNotFoundError).available).toEqual(['start1'])
  })

  it('returns FlowFileReadError when the document is not on disk', async () => {
    const missing = flow('publication')
      .start('start1', publicationInput)
      .bind('path', path.join(os.tmpdir(), 'jobik-missing', 'flow.jobik.json'))

    const result = await missing.run('start1', { title: 't', markdown: 'm' })

    expect(errorOrThrow(result, FlowFileReadError).cause).toBeDefined()
  })

  it('returns the graph error when the document does not match the flow', async () => {
    const publication = await boundPublication(
      flowDocument({
        connections: [
          { from: { node: 'start1', field: 'nope' }, to: { node: 'render', field: 'markdown' } },
        ],
      }),
    )

    const result = await publication.run('start1', { title: 't', markdown: 'm' })

    expect(errorOrThrow(result, ConnectionError).from).toEqual({ node: 'start1', field: 'nope' })
  })

  it('types the start id and the input at the call site', async () => {
    const publication = await boundPublication()

    // @ts-expect-error 'render' is a node, not a start
    const notAStart = publication.run('render', { title: 't', markdown: 'm' })
    // @ts-expect-error markdown is required by the start schema
    const shortInput = publication.run('start1', { title: 't' })

    await expect(Promise.all([notAStart, shortInput])).resolves.toHaveLength(2)
  })

  it('exposes the run surface through the package namespace', () => {
    expect(jobik.nodeStatuses).toHaveLength(6)
    expect(typeof jobik.readAsset).toBe('function')
    expect(typeof jobik.registerAsset).toBe('function')
  })

  it('leaves a flow with no reachable node with just its start', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jobik-run-'))
    const file = path.join(dir, 'flow.jobik.json')
    await fs.writeFile(file, serializeFlowDocument(flowDocument()), 'utf8')
    const lonely = flow('lonely')
      .start('s', start({ title: 'S', input: z.object({ text: z.string() }) }))
      .bind('path', file)

    const report = reportOrThrow(await lonely.run('s', { text: 'a' }))

    expect(report.nodes.map((node) => node.nodeId)).toEqual(['s'])
    expect(report.nodes[0].output).toEqual({ text: 'a' })
  })
})
