import type { FlowDocument } from '@jobik/core'
import type { FieldProblem, NodeProblem } from '#canvas/index.js'
import { endpointKey } from '#canvas/index.js'
import type { WireErrorPayload } from '#client/index.js'
import { errorCountLabel } from '#primitives/index.js'
import type { ProblemRow } from '#shell/index.js'

/**
 * One validation failure, as everything artboard `3D` draws from it: the problems strip's rows,
 * the node marks, the port marks and the failing edge.
 *
 * **What the wire can and cannot fill.** `POST /api/flows/:id/validate` answers `{ valid: true }`
 * or `{ valid: false, error }` — one `WireErrorPayload`, never a list, with no severity and no
 * source location. So `3D`'s `2 errors, 1 warning` header, its three rows and its `flow.ts:41`
 * are shapes this module can produce and this server cannot fill. Nothing is padded out: the
 * strip is handed the findings that exist and derives its own count from them, so a Studio with
 * one finding says `1 error`.
 *
 * **What it genuinely can fill is more than it looks.** `wireError.ts` projects a
 * `ConnectionError` with its `from` and `to` `FieldRef`s and its `cycle`, and `graph/validate.ts`
 * sets `to` on every unconnected-input and literal failure and both ends on a type mismatch. That
 * is exactly the data the artboard's three failure treatments need:
 *
 *   - the port the finding names, and the node it sits on,
 *   - whether that port has a source, which is what separates the solid `error` card from the
 *     dashed `blocked` one and the solid handle from the dashed one,
 *   - the connection to paint in the failure hue.
 *
 * Whether the port has a source is read off the **document**, not off `from`: `from` is null on
 * several `ConnectionError` shapes that have nothing to do with a missing source, and the
 * document is the only thing that actually knows.
 */

export interface NodeProblemMark {
  readonly problem: NodeProblem
  /** `1 error` — the mono count the marked card prints in its header. */
  readonly count: string
}

export interface FieldProblemMark {
  readonly problem: FieldProblem
  /**
   * Replaces the port's declared type annotation. Only ever `no source`, and only where the
   * document proves the port has none — `3D`'s `string ≠ Buffer` needs an expected/actual pair the
   * wire does not carry.
   */
  readonly annotation?: string
}

export interface FlowProblemModel {
  /** The problems strip's rows, newest check first. Empty when the flow is valid. */
  readonly problems: readonly ProblemRow[]
  readonly nodes: ReadonlyMap<string, NodeProblemMark>
  /** Keyed by `endpointKey(nodeId, direction, field)`. */
  readonly fields: ReadonlyMap<string, FieldProblemMark>
  /** The `toCanvasEdges` ids of the connections the finding implicates. */
  readonly edges: ReadonlySet<string>
}

/** The empty model, for a flow with nothing wrong with it. */
export const NO_PROBLEMS: FlowProblemModel = {
  problems: [],
  nodes: new Map(),
  fields: new Map(),
  edges: new Set(),
}

type FieldRef = { readonly node: string; readonly field: string }

/** A `FieldRef` off a wire payload's open index signature, or nothing. Never a partial one. */
function fieldRef(value: unknown): FieldRef | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const node = (value as { node?: unknown }).node
  const field = (value as { field?: unknown }).field
  if (typeof node !== 'string' || typeof field !== 'string') return undefined
  return { node, field }
}

function nodeIdList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

/** The id `toCanvasEdges` gives the connection between two field refs. */
export function connectionEdgeId(from: FieldRef, to: FieldRef): string {
  return `${from.node}.${from.field}->${to.node}.${to.field}`
}

export function toFlowProblems(args: {
  error: WireErrorPayload
  document: FlowDocument
}): FlowProblemModel {
  const { error, document } = args

  const problems: readonly ProblemRow[] = [
    {
      severity: 'error',
      // The server's own tag and its own words. `flow.ts:41` has no counterpart on the wire, so
      // the row carries no `source` at all rather than a guessed one.
      code: error._tag ?? 'ValidationError',
      message: error.message,
    },
  ]

  const nodes = new Map<string, NodeProblemMark>()
  const fields = new Map<string, FieldProblemMark>()
  const edges = new Set<string>()

  const to = fieldRef(error.to)
  const from = fieldRef(error.from)

  if (to !== undefined) {
    const incoming = document.connections.find(
      (connection) => connection.to.node === to.node && connection.to.field === to.field,
    )
    const hasSource = incoming !== undefined

    // The whole split `3D` draws: a port with a source it cannot use puts its node on the solid
    // failure card; a port with no source at all puts its node on the dashed one that cannot run.
    nodes.set(to.node, {
      problem: hasSource ? 'error' : 'blocked',
      count: errorCountLabel(1),
    })
    fields.set(endpointKey(to.node, 'target', to.field), {
      problem: hasSource ? 'mismatch' : 'unsourced',
      ...(hasSource ? {} : { annotation: 'no source' }),
    })

    const source = from ?? (incoming === undefined ? undefined : incoming.from)
    if (source !== undefined) {
      fields.set(endpointKey(source.node, 'source', source.field), { problem: 'linked' })
      edges.add(connectionEdgeId(source, to))
    }
  }

  // A cycle names its nodes and no port at all — the finding is about the shape of the graph, so
  // every node in it is marked and nothing else is.
  for (const nodeId of nodeIdList(error.cycle)) {
    if (!nodes.has(nodeId)) nodes.set(nodeId, { problem: 'error', count: errorCountLabel(1) })
  }

  return { problems, nodes, fields, edges }
}
