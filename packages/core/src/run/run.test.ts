import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import { serializeFlowDocument } from '#document/schema.js'
import { ConnectionError, FlowFileReadError, RunInputError, StartNotFoundError } from '#errors.js'
import { flow } from '#flow.js'
import {
  errorOrThrow,
  flowDocument,
  publicationDocument,
  publicationInput,
  publish,
  render,
} from '#graph/fixtures.js'
import * as jobik from '#index.js'
import { start } from '#node.js'
import { throwingSchema } from './fixtures.js'
import { nextRunNumber } from './run-number.js'
import type { RunEvent, RunReport } from './types.js'

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
  it('executes a supplied document snapshot after the file has changed', async () => {
    const document = publicationDocument()
    const publication = await boundPublication(document)
    await fs.writeFile(publication.path, '{invalid document')
    const result = reportOrThrow(
      await publication.run('start1', { title: 't', markdown: 'saved' }, { document }),
    )
    expect(result.status).toBe('ok')
    expect(result.nodes.find((node) => node.nodeId === 'render')?.input).toEqual({
      markdown: 'saved',
    })
  })

  it('records the actual schema-transformed input delivered to a node', async () => {
    const document = flowDocument({
      connections: [{ from: { node: 's', field: 'text' }, to: { node: 'n', field: 'text' } }],
    })
    const example = jobik
      .flow('transformed-input')
      .start('s', jobik.start({ title: 'S', input: z.object({ text: z.string() }) }))
      .node(
        'n',
        jobik.node({
          title: 'N',
          input: z.object({ text: z.string().transform((value) => value.trim()) }),
          output: z.object({ text: z.string() }),
          run: (input) => input,
        }),
      )
      .bind('path', path.resolve('unused-document.jobik.json'))
    const result = reportOrThrow(await example.run('s', { text: '  normalized  ' }, { document }))
    expect(result.nodes.find((node) => node.nodeId === 'n')).toMatchObject({
      input: { text: 'normalized' },
      output: { text: 'normalized' },
    })
  })

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

  it('claims the number as the request arrives, not once the document has been read', async () => {
    const publication = await boundPublication()

    // Not awaited: `runFlow` runs synchronously up to its first await, and the claim is before it.
    const pending = publication.run('start1', { title: 't', markdown: 'm' })

    // So the flow's counter has already moved, although this run has not read its document yet.
    // With the claim after the awaits, three runs fired together came back #1, #3, #2 — numbered
    // in the order their reads and validations finished rather than the order Run was pressed.
    expect(nextRunNumber(publication.path)).toBe(2)
    expect(reportOrThrow(await pending).runNumber).toBe(1)
  })

  it('gives the number back when the run is rejected before it starts', async () => {
    const publication = await boundPublication()

    const rejected = await publication.run('start1', {
      title: 't',
      markdown: 42,
    } as unknown as { title: string; markdown: string })
    errorOrThrow(rejected, RunInputError)

    // An empty required field is ordinary Studio traffic. Claiming early without this rollback
    // would burn #1 on it and open the run history with #2.
    expect(
      reportOrThrow(await publication.run('start1', { title: 't', markdown: 'm' })).runNumber,
    ).toBe(1)
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

  it('returns RunInputError, not a rejection, when the start input schema throws', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'jobik-run-'))
    const file = path.join(dir, 'flow.jobik.json')
    await fs.writeFile(file, serializeFlowDocument(flowDocument()), 'utf8')
    const throwingStart = flow('throwing-start')
      .start('s', start({ title: 'S', input: throwingSchema }))
      .bind('path', file)

    const result = await throwingStart.run('s', { text: 'a' })

    const error = errorOrThrow(result, RunInputError)
    expect(error.startId).toBe('s')
    expect(error.cause).toBeInstanceOf(RangeError)
    expect(error.issues).toEqual([])
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

    const [notAStartResult, shortInputResult] = await Promise.all([notAStart, shortInput])

    expect(errorOrThrow(notAStartResult, StartNotFoundError).startId).toBe('render')
    expect(errorOrThrow(shortInputResult, RunInputError).startId).toBe('start1')
  })

  it('exposes the run surface through the package namespace', () => {
    expect(jobik.nodeStatuses).toHaveLength(6)
    expect(typeof jobik.readAsset).toBe('function')
    expect(typeof jobik.registerAsset).toBe('function')
  })

  it('wires an onEvent collector through to executeRunGraph and streams the whole run', async () => {
    const publication = await boundPublication()
    const events: RunEvent[] = []

    reportOrThrow(
      await publication.run(
        'start1',
        { title: 'A title', markdown: 'hello' },
        { onEvent: (event) => events.push(event) },
      ),
    )

    expect(events[0]?.type).toBe('run-started')
    expect(events.at(-1)?.type).toBe('run-settled')
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
