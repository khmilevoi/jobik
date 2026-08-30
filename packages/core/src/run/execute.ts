import { NodeExecutionError, RunCancelledError, UpstreamFailedError } from '../errors.js'
import type { GraphNode, RunGraph } from '../graph/types.js'
import type { NodeRunContext } from '../node.js'
import { collectAssets } from './assets.js'
import type {
  NodeReport,
  NodeStatus,
  RunEvent,
  RunLogLine,
  RunOptions,
  RunReport,
  RunStatus,
} from './types.js'

/**
 * The execution engine over one selected start's reachable subgraph.
 *
 * P5 already decided WHAT runs and in WHICH order; this module only walks that order once,
 * sequentially, and records what happened. It never returns an error value: a run that started
 * always produces a report, and everything that could stop a run before it starts is handled by
 * `run.ts`.
 */

/** What `Promise.race` resolves with when the run is cancelled before a handler settles. */
const cancelledSentinel = Symbol('jobik.run.cancelled')

function whenAborted(signal: AbortSignal): Promise<typeof cancelledSentinel> {
  if (signal.aborted) return Promise.resolve(cancelledSentinel)
  return new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve(cancelledSentinel), { once: true })
  })
}

export async function executeRunGraph(args: {
  graph: RunGraph
  startOutput: Readonly<Record<string, unknown>>
  runNumber: number
  options?: RunOptions
}): Promise<RunReport> {
  const { graph, startOutput, runNumber, options } = args
  const emit = (event: RunEvent) => options?.onEvent?.(event)
  const runStartedAt = performance.now()

  // The engine owns the signal handlers receive, so a caller's signal is linked into it rather than
  // handed over: aborting always carries a `RunCancelledError`, which `errore.isAbortError` can then
  // find anywhere in a cause chain.
  const outerSignal = options?.signal
  const controller = new AbortController()
  const abortRun = () => {
    if (controller.signal.aborted) return
    controller.abort(new RunCancelledError({ runNumber, cause: outerSignal?.reason }))
  }
  // Only `abortRun` ever aborts this controller, so the reason is always a `RunCancelledError`.
  const cancellation = () => controller.signal.reason as RunCancelledError
  if (outerSignal !== undefined) {
    if (outerSignal.aborted) abortRun()
    else outerSignal.addEventListener('abort', abortRun, { once: true })
  }
  // One listener for the whole run, not one per node: an AbortSignal warns past ten of them.
  const aborted = whenAborted(controller.signal)

  const nodes: NodeReport[] = []
  const outputs = new Map<string, Readonly<Record<string, unknown>>>()
  const statuses = new Map<string, NodeStatus>()
  const failureOrigin = new Map<string, string>()
  const logs: RunLogLine[] = []

  const settle = (report: NodeReport) => {
    statuses.set(report.nodeId, report.status)
    nodes.push(report)
    if (report.output !== null) outputs.set(report.nodeId, report.output)
    emit({
      type: 'node-status',
      nodeId: report.nodeId,
      status: report.status,
      elapsedMs: report.elapsedMs,
      error: report.error,
    })
  }

  emit({
    type: 'run-started',
    runNumber,
    flowName: graph.flowName,
    startId: graph.startId,
    nodeCount: graph.order.length,
  })

  for (const nodeId of graph.order) {
    statuses.set(nodeId, 'queued')
    emit({ type: 'node-status', nodeId, status: 'queued', elapsedMs: 0, error: null })
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

    if (controller.signal.aborted) {
      settle({
        nodeId,
        status: 'skipped',
        elapsedMs: 0,
        output: null,
        assets: {},
        error: cancellation(),
      })
      continue
    }

    const blocker = blockedBy({ node, graph, statuses, failureOrigin })
    if (blocker !== undefined) {
      failureOrigin.set(nodeId, blocker)
      settle({
        nodeId,
        status: 'skipped',
        elapsedMs: 0,
        output: null,
        assets: {},
        error: new UpstreamFailedError({ nodeId, upstreamNodeId: blocker, runNumber }),
      })
      continue
    }

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
    emit({ type: 'node-status', nodeId, status: 'running', elapsedMs: 0, error: null })
    const startedAt = performance.now()
    const context: NodeRunContext = {
      signal: controller.signal,
      log: (message: string) => {
        const line: RunLogLine = { nodeId, message, at: Date.now() }
        logs.push(line)
        emit({ type: 'node-log', line })
      },
    }
    // The handler is third-party code, so this is an error boundary: a synchronous throw, a
    // rejection and a thrown non-Error all have to come back as a value. The async IIFE turns a
    // synchronous throw into a rejection while still invoking the handler synchronously, and
    // `.catch` accepts any thrown value. `errore.try` is deliberately NOT used here: it rethrows
    // anything that is not an `Error` instance, which would punch a hole straight through the
    // boundary the spec requires.
    const invoked = (async () => definition.run(parsedInput.data, context))().catch(
      (cause: unknown) => new NodeExecutionError({ nodeId, runNumber, cause }),
    )
    // `invoked` already has its rejection handled, so abandoning it here can never surface as an
    // unhandled rejection.
    const settledValue: unknown = await Promise.race([invoked, aborted])
    const elapsedMs = performance.now() - startedAt

    if (controller.signal.aborted) {
      // A handler still running is not a settled result, so it is skipped like the nodes behind it
      // — but it keeps the time it really spent running.
      settle({
        nodeId,
        status: 'skipped',
        elapsedMs,
        output: null,
        assets: {},
        error: cancellation(),
      })
      continue
    }

    if (settledValue instanceof Error) {
      settle({
        nodeId,
        status: 'failed',
        elapsedMs,
        output: null,
        assets: {},
        error: settledValue,
      })
      continue
    }

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

  outerSignal?.removeEventListener('abort', abortRun)

  const report: RunReport = {
    flowName: graph.flowName,
    startId: graph.startId,
    runNumber,
    status: controller.signal.aborted ? 'cancelled' : runStatusOf(nodes),
    elapsedMs: performance.now() - runStartedAt,
    nodes,
    logs,
    error: controller.signal.aborted ? cancellation() : null,
  }
  emit({ type: 'run-settled', report })
  return report
}

/**
 * How the run settled. A run with no failed node is `ok` even when a node was skipped for want of a
 * start that did not run — nothing failed in that run.
 */
function runStatusOf(nodes: readonly NodeReport[]): RunStatus {
  if (nodes.some((node) => node.status === 'failed')) return 'failed'
  return 'ok'
}

/**
 * The node that stops this one from running, or `undefined` when every dependency produced an
 * output.
 *
 * A dependency outside the run graph is fed by a different start and never ran in this run, so it
 * blocks too and names itself. A dependency that was itself skipped names the node whose failure
 * started the cascade, so `UpstreamFailedError`'s message stays true however deep the chain runs.
 */
function blockedBy(args: {
  node: GraphNode
  graph: RunGraph
  statuses: ReadonlyMap<string, NodeStatus>
  failureOrigin: ReadonlyMap<string, string>
}): string | undefined {
  for (const dependency of args.node.dependencies) {
    if (!args.graph.nodes.has(dependency)) return dependency
    const status = args.statuses.get(dependency)
    if (status === 'failed') return dependency
    if (status === 'skipped') return args.failureOrigin.get(dependency) ?? dependency
  }
  return undefined
}
