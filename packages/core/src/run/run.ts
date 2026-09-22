import { readFlowDocument } from '#document/read.js'
import { toSchemaIssues } from '#document/schema.js'
import { RunInputError } from '#errors.js'
import type { BoundFlow } from '#flow.js'
import { resolveRunGraph } from '#graph/run-graph.js'
import { validateFlowGraph } from '#graph/validate.js'
import { executeRunGraph } from './execute.js'
import { nextRunNumber, releaseRunNumber } from './run-number.js'
import type { RunOptions, RunReport, RunStartError } from './types.js'

/**
 * One run, end to end: load the current document, bind it to the flow, narrow it to the selected
 * start's reachable subgraph, validate the run input, then execute.
 *
 * Everything that stops a run before it starts is returned as an error value; everything that
 * happens once it started lives in the report. `BoundFlow.run()` is this function with the flow
 * already applied — `flow.ts` imports it as a value while this module imports only the TYPE of
 * `BoundFlow` back, so the cycle is erased at build time.
 */
export async function runFlow(args: {
  flow: BoundFlow
  startId: string
  input: unknown
  options?: RunOptions
}): Promise<RunReport | RunStartError> {
  // Claimed here, before the awaits, so the number records the order Run was pressed rather than
  // the order these three steps happen to finish — fire three runs of one flow together and they
  // used to come back #1, #3, #2. `nextRunNumber` is synchronous and so still race-free; only the
  // moment of the claim moved. Every path that gives up before the engine hands it back — see
  // `releaseRunNumber` for what that can and cannot undo.
  const runNumber = nextRunNumber(args.flow.path)
  const rejected = <E>(error: E): E => {
    releaseRunNumber(args.flow.path, runNumber)
    return error
  }

  const file =
    args.options?.document === undefined
      ? await readFlowDocument({ path: args.flow.path })
      : { document: args.options.document }
  if (file instanceof Error) return rejected(file)

  const graph = validateFlowGraph({ flow: args.flow, document: file.document })
  if (graph instanceof Error) return rejected(graph)

  const runGraph = resolveRunGraph({ graph, startId: args.startId })
  if (runGraph instanceof Error) return rejected(runGraph)

  // A start has no handler: its validated input IS its output fields. That schema is flow-author
  // code, exactly as third-party as a handler's, so a throw from inside `.transform()` or
  // `.refine()` is contained the same way `execute.ts` contains one from a node's schema — Zod v4's
  // `safeParse` does not catch it. A thrown value carries no `ZodError` to flatten, so only `cause`
  // is set for that path; an ordinary parse failure keeps its flattened `issues` as before.
  let parsed: ReturnType<typeof runGraph.start.definition.input.safeParse>
  try {
    parsed = runGraph.start.definition.input.safeParse(args.input)
  } catch (cause) {
    return rejected(new RunInputError({ startId: args.startId, cause }))
  }
  if (!parsed.success) {
    return rejected(
      new RunInputError({
        startId: args.startId,
        issues: toSchemaIssues(parsed.error),
        cause: parsed.error,
      }),
    )
  }

  return executeRunGraph({
    graph: runGraph,
    startOutput: parsed.data,
    runNumber,
    options: args.options,
  })
}
