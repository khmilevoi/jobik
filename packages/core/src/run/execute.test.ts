import { describe, expect, it } from 'vitest'
import { UpstreamFailedError } from '#errors.js'
import {
  branchDocument,
  branchFlow,
  okOrThrow,
  publicationDocument,
  publicationFlow,
} from '#graph/fixtures.js'
import { resolveRunGraph } from '#graph/run-graph.js'
import { validateFlowGraph } from '#graph/validate.js'
import { readAsset } from './assets.js'
import { executeRunGraph } from './execute.js'

function publicationRunGraph() {
  const graph = okOrThrow(
    validateFlowGraph({ flow: publicationFlow, document: publicationDocument() }),
  )
  return okOrThrow(resolveRunGraph({ graph, startId: 'start1' }))
}

function runPublication(runNumber = 1) {
  return executeRunGraph({
    graph: publicationRunGraph(),
    startOutput: { title: 'A title', markdown: 'hello' },
    runNumber,
  })
}

describe('executeRunGraph()', () => {
  it('reports every reachable node, in topological order, with the run identity', async () => {
    const report = await runPublication(7)

    expect(report.nodes.map((node) => node.nodeId)).toEqual(['start1', 'render', 'publish'])
    expect(report.nodes.map((node) => node.status)).toEqual(['ok', 'ok', 'ok'])
    expect(report.flowName).toBe('publication')
    expect(report.startId).toBe('start1')
    expect(report.runNumber).toBe(7)
    expect(report.status).toBe('ok')
    expect(report.error).toBeNull()
    expect(report.logs).toEqual([])
  })

  it('turns the validated start input into the start node output, at no elapsed cost', async () => {
    const report = await runPublication()
    const start = report.nodes[0]

    expect(start.output).toEqual({ title: 'A title', markdown: 'hello' })
    expect(start.elapsedMs).toBe(0)
    expect(start.assets).toEqual({})
    expect(start.error).toBeNull()
  })

  it('feeds a node its connected fields and stores the validated handler output', async () => {
    const report = await runPublication()

    expect(report.nodes[1].output).toMatchObject({ caption: 'hello' })
  })

  it('feeds an unconnected input field from the document literal', async () => {
    // `publish.channel` is neither connected nor optional: without the literal the input parse
    // fails and this node cannot be `ok`.
    const report = await runPublication()

    expect(report.nodes[2].status).toBe('ok')
    expect(report.nodes[2].output).toEqual({})
  })

  it('keeps the real Buffer in the report and describes it in the node asset map', async () => {
    const report = await runPublication()
    const render = report.nodes[1]

    expect(render.output?.image).toBeInstanceOf(Buffer)
    expect(render.assets.image.mime).toBe('image/png')
    expect(render.assets.image.bytes).toBe(Buffer.from('hello').byteLength)
    expect(readAsset(render.assets.image.id)?.data).toEqual(Buffer.from('hello'))
  })

  it('measures elapsed time for the run and for each invoked node', async () => {
    const report = await runPublication()

    // The handler is synchronous, so a low-resolution timer could measure it at exactly 0 — the
    // plan specifies `toBeGreaterThanOrEqual(0)` here for that reason.
    expect(report.nodes[1].elapsedMs).toBeGreaterThanOrEqual(0)
    expect(report.elapsedMs).toBeGreaterThanOrEqual(report.nodes[1].elapsedMs)
  })

  it('never reports ok while blaming a node this run never contained', async () => {
    // branchFlow: s1 -> a -> {b, d} and s2 -> c -> d. `d` also needs `c`, which a run from `s1`
    // never reaches, so `d` cannot execute here however the run goes.
    const graph = okOrThrow(validateFlowGraph({ flow: branchFlow, document: branchDocument() }))
    const runGraph = okOrThrow(resolveRunGraph({ graph, startId: 's1' }))
    const report = await executeRunGraph({
      graph: runGraph,
      startOutput: { seed: 'x' },
      runNumber: 1,
    })

    // `errore` types a `$variable` placeholder as `string | number`; node ids are always strings.
    const blamedOutsiders = report.nodes.flatMap((node) =>
      node.error instanceof UpstreamFailedError &&
      !runGraph.nodes.has(String(node.error.upstreamNodeId))
        ? [`${node.nodeId} blamed on ${node.error.upstreamNodeId}`]
        : [],
    )
    expect(blamedOutsiders).toEqual([])

    // An `ok` run is a run that ran everything it said it contained.
    const notOk = report.nodes.filter((node) => node.status !== 'ok').map((node) => node.nodeId)
    expect(report.status === 'ok' ? notOk : []).toEqual([])
  })
})
