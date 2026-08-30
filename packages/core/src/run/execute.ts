import { NodeExecutionError } from '../errors.js'
import type { RunGraph } from '../graph/types.js'
import type { NodeRunContext } from '../node.js'
import { collectAssets } from './assets.js'
import type { NodeReport, NodeStatus, RunEvent, RunOptions, RunReport } from './types.js'

/**
 * The execution engine over one selected start's reachable subgraph.
 *
 * P5 already decided WHAT runs and in WHICH order; this module only walks that order once,
 * sequentially, and records what happened. It never returns an error value: a run that started
 * always produces a report, and everything that could stop a run before it starts is handled by
 * `run.ts`.
 */
export async function executeRunGraph(args: {
  graph: RunGraph
  startOutput: Readonly<Record<string, unknown>>
  runNumber: number
  options?: RunOptions
}): Promise<RunReport> {
  const { graph, startOutput, runNumber, options } = args
  const emit = (event: RunEvent) => options?.onEvent?.(event)
  const runStartedAt = performance.now()

  const nodes: NodeReport[] = []
  const outputs = new Map<string, Readonly<Record<string, unknown>>>()
  const statuses = new Map<string, NodeStatus>()

  const settle = (report: NodeReport) => {
    statuses.set(report.nodeId, report.status)
    nodes.push(report)
    if (report.output !== null) outputs.set(report.nodeId, report.output)
  }

  for (const nodeId of graph.order) {
    statuses.set(nodeId, 'queued')
  }

  settle({
    nodeId: graph.startId,
    status: 'ok',
    elapsedMs: 0,
    output: startOutput,
    assets: {},
    error: null,
  })

  for (const nodeId of graph.order) {
    if (nodeId === graph.startId) continue
    const node = graph.nodes.get(nodeId)
    if (node === undefined) continue
    const definition = node.definition
    // Unreachable: `validateFlowGraph` rejects a connection INTO a start, so no start is ever a
    // dependent of anything and no start but the selected one can be in a run graph.
    if (definition.kind === 'start') continue

    const assembled: Record<string, unknown> = { ...node.literals }
    for (const edge of node.inputs) {
      const source = outputs.get(edge.from.node)
      if (source === undefined) continue
      assembled[edge.field] = source[edge.from.field]
    }

    const parsedInput = definition.input.safeParse(assembled)
    if (!parsedInput.success) {
      settle({
        nodeId,
        status: 'failed',
        elapsedMs: 0,
        output: null,
        assets: {},
        error: new NodeExecutionError({ nodeId, runNumber, cause: parsedInput.error }),
      })
      continue
    }

    statuses.set(nodeId, 'running')
    const startedAt = performance.now()
    const context: NodeRunContext = { signal: new AbortController().signal }
    const settledValue: unknown = await definition.run(parsedInput.data, context)
    const elapsedMs = performance.now() - startedAt

    const parsedOutput = definition.output.safeParse(settledValue)
    if (!parsedOutput.success) {
      settle({
        nodeId,
        status: 'failed',
        elapsedMs,
        output: null,
        assets: {},
        error: new NodeExecutionError({ nodeId, runNumber, cause: parsedOutput.error }),
      })
      continue
    }

    settle({
      nodeId,
      status: 'ok',
      elapsedMs,
      output: parsedOutput.data,
      assets: collectAssets({ schema: definition.output, output: parsedOutput.data }),
      error: null,
    })
  }

  const report: RunReport = {
    flowName: graph.flowName,
    startId: graph.startId,
    runNumber,
    status: 'ok',
    elapsedMs: performance.now() - runStartedAt,
    nodes,
    logs: [],
    error: null,
  }
  emit({ type: 'run-settled', report })
  return report
}
