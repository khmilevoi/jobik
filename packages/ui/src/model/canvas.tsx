import type { FlowDocument, NodeStatus } from '@jobik/core'
import type { Atom, Computed } from '@reatom/core'
import { bind, computed } from '@reatom/core'
import type { FlowCanvasEdge, FlowCanvasNode } from '#canvas/index.js'
import { MetadataRow, RUN_ANNOTATIONS } from '#canvas/index.js'
import type {
  SafeFlowDescriptorPayload,
  SafeNodeDescriptorPayload,
  WireNodeReportPayload,
} from '#client/index.js'
import { resolveOutputComponent } from '#output/index.js'
import { assetMetaParts } from '#run/index.js'
import { formatElapsed } from '#studio/format.js'
import type { NodeOverlay } from '#studio/graphModel.js'
import { toCanvasEdges, toCanvasNodes, waitingOnField } from '#studio/graphModel.js'
import { completedNodeCount, type NodeRunRecord } from '#studio/runSession.js'
import type {
  CanvasModel,
  ExtensionModel,
  OutputModel,
  RetryState,
  RunModel,
  StudioDeps,
  ValidationModel,
} from './types.js'

/**
 * The canvas arrays, and the overlays that decorate them — with the two things that made a seven
 * node canvas repaint ten times a second taken out of both.
 *
 * `studio/graphModel.ts` is still the mapper. `toCanvasNodes`, `toCanvasEdges` and
 * `waitingOnField` are consumed here exactly as they are, from inside `computed` bodies, so every
 * rule those functions state is still stated once. What changed is *where the derivation is cut*.
 *
 * ## The array carries structure; the card reads its own overlay
 *
 * `FlowCanvas` syncs its internal React Flow node state from the **identity** of the `nodes` and
 * `edges` props (`FlowCanvasProps` says so twice), so a new array discards an in-flight drag and
 * React Flow's own selection. The hook rebuilt `nodes` whenever `overlays` was rebuilt — which was
 * on every stream frame — so a drag begun while a run streamed reset under the pointer.
 *
 * So {@link CanvasModel.nodes} is derived from the **structural** inputs alone: the descriptor, the
 * document, the marked node and `3D`'s problem marks. None of those move while a run is in flight
 * — the draft lock stops a drag being persisted and `validate` refuses while `locked` — so the
 * array is invalidated **zero times** across a whole run. The run's own decoration is not in it:
 * a card reads {@link CanvasModel.nodeOverlay} for its own id and nothing else's.
 *
 * ## One overlay per node, not one map per frame
 *
 * `overlays` used to be a single `useMemo` over the whole session: one `node-status` line replaced
 * the session, the memo re-ran, and every card got a new overlay object whether or not the line
 * was about it. Here each node id has its own `computed` (RTM-S03), created once and kept in a
 * `Map` keyed by node id (RTM-S07). The chain that makes it work is
 * `viewedSession → _sessionNodes → node#id.record → node#id.overlay`: `applyRunEvent` copies the
 * node map on a `node-status` line but leaves every untouched `NodeRunRecord` at its original
 * identity, so every other node's `record` recomputes to the *same value* and Reatom stops there.
 *
 * **The cache is the load-bearing line.** A model factory called straight from a `computed` body
 * builds a new model on every recomputation, throwing away the state and the memoisation of every
 * item; the list then silently forgets, and every card re-renders anyway.
 *
 * The three cross-node dependencies that remain are real, and each is scoped to the nodes it
 * genuinely concerns rather than to the session:
 *
 *  * a **running** card's 2 px bar is the run's own progress, so it reads {@link _progress} — a
 *    number, which only propagates when it actually changes;
 *  * a **queued** card's `Waiting on <node>.<field>` line depends on whether its own upstreams have
 *    settled, so it reads exactly those nodes' `status` computeds and no others;
 *  * an **ok** card's inline slot needs the settled report's entry for its node, which arrives once.
 *
 * ## The two indexes
 *
 * The hook did `report.nodes.find(…)` and `descriptor.nodes.find(…)` **per node, per frame** — two
 * O(n²) scans. {@link _reportNodes} and {@link _descriptorNodes} index each list into a `Map` once,
 * in a `computed` whose source changes once per run and once per load respectively.
 *
 * `NodeOverlay.outputSlot.content` is a `ReactNode`, which is why this module is a `.tsx` file.
 */

/**
 * The statuses that carry a time worth printing. `queued`, `running` and `skipped` have none:
 * a `skipped` node was never invoked, so its `elapsedMs` is zero and printing `0.0s` beside it
 * would read as a measurement.
 *
 * Together with {@link toCardState} and {@link annotationsFor} this is the per-node half of
 * `studio/runPresenter.ts`'s `toNodeOverlays`.
 *
 * **The duplication is deliberate and it stays, for now.** `toNodeOverlays` takes a whole
 * `RunSession` and cannot be split per node, which is the entire reason this spelling exists; it
 * has no production caller left, and its own six cases in `studio/runPresenter.test.ts` are the
 * only place several of these rules are stated against a plain function rather than through a live
 * model. Collapsing it means moving those six cases, and that is a `studio/` sweep, not a line to
 * delete from here. Until then the test in `canvas.test.tsx` named *agrees with `toNodeOverlays`*
 * is the only thing holding the two spellings honest, and it is no longer true that anything
 * renders from the other one.
 */
const SETTLED_WITH_TIME: ReadonlySet<NodeStatus> = new Set<NodeStatus>(['ok', 'failed', 'cached'])

/** `### Node cards`: `received` on bound inputs, `pending` on unsettled outputs, `waiting` on a
 *  queued node's inputs. */
function annotationsFor(status: NodeStatus): {
  readonly inputAnnotation: string
  readonly outputAnnotation?: string
} {
  if (status === 'queued') return { inputAnnotation: RUN_ANNOTATIONS.waiting }
  if (status === 'running') {
    return {
      inputAnnotation: RUN_ANNOTATIONS.received,
      outputAnnotation: RUN_ANNOTATIONS.pending,
    }
  }
  return { inputAnnotation: RUN_ANNOTATIONS.received }
}

function toCardState(status: NodeStatus): NodeOverlay['state'] {
  // Standing ruling 2: the `Node states` artboard has no `skipped` card, and `queued` is its only
  // "did not run" treatment. The status word (kept alongside) keeps the two distinguishable.
  if (status === 'skipped') return 'queued'
  return status
}

/** Has this node produced its outcome? The set `completedNodeCount` counts, read one node at a time. */
function isSettledStatus(status: NodeStatus | undefined): boolean {
  return status !== undefined && status !== 'queued' && status !== 'running'
}

/**
 * One node's run-time appearance, derived from that node's own record and cached by node id.
 *
 * `record` and `status` look like the two derivations `reatomRunNodes` makes in `model/run.ts`, and
 * they are still made here rather than reused. The type barrier that used to force that is gone —
 * that factory now takes a `Computed<RunSession | undefined>`, so `viewedSession` passes — but the
 * derivation is genuinely a different one, and swapping it in would undo this file's whole reason
 * for existing:
 *
 *  * its `record` reads `session()?.nodes.get(id)`, so a `node-log` or `run-accepted` line —
 *    which replaces the session and leaves the node map alone — recomputes **every** node's record
 *    before Reatom notices each answer is unchanged. Here the chain runs through
 *    {@link _sessionNodes}, so that same line recomputes exactly one unit and stops;
 *  * `settled` and `overlay` have no counterpart there, so the per-node cache this module keeps is
 *    needed either way, and reusing `RunNodeModel` would mean two caches and two `node#id.record`
 *    units per node rather than one.
 *
 * `reatomRunNodes` is the right thing for a surface that wants a run's nodes as data. This is the
 * canvas's own decoration chain, and it is cut one step higher on purpose.
 */
interface CanvasNodeModel {
  readonly nodeId: string
  readonly record: Computed<NodeRunRecord | undefined>
  readonly status: Computed<NodeStatus | undefined>
  /**
   * Has this node produced its outcome? A `boolean` rather than the status, and its own unit rather
   * than a read of `status`, because it is what a *downstream* card asks: a node moving from
   * `queued` to `running` does not change what anything waiting on it is waiting for, and asking
   * the coarser question is what keeps that frame from reaching those cards at all.
   */
  readonly settled: Computed<boolean>
  /** `undefined` for a node the viewed run never seeded — an idle card, with nothing to say. */
  readonly overlay: Computed<NodeOverlay | undefined>
}

/**
 * What this factory returns — {@link CanvasModel}, whole.
 *
 * It used to be `CanvasModel` *plus* `nodeOverlay`, because the contract declared only the three
 * collections and widening it was not that task's to do. The wiring wave promoted the accessor onto
 * {@link CanvasModel} itself, so the two are now the same type and this name survives only as the
 * one the tests and the barrel already spell.
 */
export type CanvasOverlaysModel = CanvasModel

export function reatomCanvas(
  deps: StudioDeps,
  input: {
    descriptor: Computed<SafeFlowDescriptorPayload | undefined>
    document: Computed<FlowDocument | undefined>
    selectedNodeId: Atom<string | undefined>
    problems: ValidationModel['problems']
    viewedSession: RunModel['viewedSession']
    running: Atom<boolean>
    retry: Atom<RetryState | undefined>
    retryNode: RunModel['retryNode']
    extension: ExtensionModel['descriptor']
    openOutput: OutputModel['open']
  },
  name: string,
): CanvasOverlaysModel {
  const assetUrl = (asset: Parameters<StudioDeps['client']['assetUrl']>[0]): string =>
    deps.client.assetUrl(asset)

  /**
   * RTM-A04, from the other side: these two ride inside model **data** and are invoked later by a
   * React `onClick`, which runs outside every frame. A surface cannot `wrap` a callback it did not
   * write, so the frame is attached here, once, where the model is built.
   */
  const retryNode = bind(input.retryNode)
  const openOutput = bind(input.openOutput)

  /**
   * The session's node map, on its own. A `node-log` or `run-accepted` line replaces the session
   * and leaves this map alone, so it is where the per-node chain starts rather than at the session.
   */
  const _sessionNodes = computed(() => input.viewedSession()?.nodes, `${name}._sessionNodes`)

  /** The settled report, alone — it lands once and nothing else about the session touches it. */
  const _report = computed(() => input.viewedSession()?.report, `${name}._report`)

  /** The first of the two indexes: `report.nodes.find(…)` was run once per node, per frame. */
  const _reportNodes = computed<ReadonlyMap<string, WireNodeReportPayload>>(() => {
    const index = new Map<string, WireNodeReportPayload>()
    const report = _report()
    if (report === undefined) return index
    for (const node of report.nodes) index.set(node.nodeId, node)
    return index
  }, `${name}._reportNodes`)

  /** The second: `descriptor.nodes.find(…)`, for the producing node's own name in a slot caption. */
  const _descriptorNodes = computed<ReadonlyMap<string, SafeNodeDescriptorPayload>>(() => {
    const index = new Map<string, SafeNodeDescriptorPayload>()
    const descriptor = input.descriptor()
    if (descriptor === undefined) return index
    for (const node of descriptor.nodes) index.set(node.id, node)
    return index
  }, `${name}._descriptorNodes`)

  /**
   * Which nodes feed each node, from the document's own connection list.
   *
   * It exists so a queued card can name the *dependencies* it is blocked on rather than reading a
   * set built from the whole session: a card reads exactly its own upstreams' `status` computeds,
   * so a line about a node it does not depend on reaches it not at all.
   */
  const _incomingSources = computed<ReadonlyMap<string, readonly string[]>>(() => {
    const index = new Map<string, string[]>()
    const document = input.document()
    if (document === undefined) return index
    for (const connection of document.connections) {
      const sources = index.get(connection.to.node) ?? []
      if (!sources.includes(connection.from.node)) sources.push(connection.from.node)
      index.set(connection.to.node, sources)
    }
    return index
  }, `${name}._incomingSources`)

  /**
   * `### Node cards`: a running node's 2 px determinate bar. Nothing in the stream reports per-node
   * progress, so the bar reflects how far the run itself has come — the one genuinely global number
   * an overlay reads, and a number rather than a set precisely so that a frame which does not move
   * it notifies nobody.
   */
  const _progress = computed(() => {
    const session = input.viewedSession()
    if (session === undefined) return 0.05
    const total = session.nodeCount > 0 ? session.nodeCount : session.nodes.size
    if (total <= 0) return 0.05
    return Math.max(0.05, completedNodeCount(session) / total)
  }, `${name}._progress`)

  /** RTM-S07: the derived collection is a `computed` over the source **plus** this cache. */
  const models = new Map<string, CanvasNodeModel>()

  const model = (nodeId: string): CanvasNodeModel => {
    const cached = models.get(nodeId)
    if (cached !== undefined) return cached
    // RTM-S05: a per-instance unit names itself with `#id`.
    const unit = `${name}.node#${nodeId}`
    const record = computed(() => _sessionNodes()?.get(nodeId), `${unit}.record`)
    const status = computed(() => record()?.status, `${unit}.status`)
    const settled = computed(() => isSettledStatus(status()), `${unit}.settled`)

    const overlay = computed((): NodeOverlay | undefined => {
      const current = record()
      if (current === undefined) return undefined

      const base: NodeOverlay = {
        state: toCardState(current.status),
        status: current.status,
        ...(SETTLED_WITH_TIME.has(current.status)
          ? { elapsed: formatElapsed(current.elapsedMs) }
          : {}),
        ...(current.status === 'running' ? { progress: _progress() } : {}),
        ...annotationsFor(current.status),
        ...(current.status === 'failed' && current.error !== null
          ? {
              detail: {
                kind: 'failed' as const,
                errorName: current.error._tag ?? 'Error',
                message: current.error.message,
              },
            }
          : {}),
      }

      /**
       * `3B` — the retried card, for as long as the run that retries it is in flight.
       *
       * It outranks every branch below: the node is being re-run, and what the card has to say is
       * that, not that it is queued behind an upstream. It keeps the error well of the run it is
       * retrying from, so the card still says what it is retrying *from*, and both footer actions
       * dim.
       *
       * There is deliberately no `elapsed` here, and no clock: nothing on the wire reports a
       * per-node time while a node runs, and the run's own clock ticks every 100ms — feeding it in
       * would invalidate an overlay ten times a second. The run clock is in the dock header.
       *
       * `retry` is read first so that `running` becomes a dependency of this overlay only while a
       * retry actually stands; on every other frame a run starting or ending reaches no card here.
       */
      const retry = input.retry()
      if (retry?.nodeId === nodeId && input.running() && !isSettledStatus(current.status)) {
        return {
          ...base,
          state: 'retrying',
          status: 'retrying',
          detail: {
            kind: 'failed',
            errorName: retry.errorName,
            message: retry.message,
            retrying: true,
          },
        }
      }

      // `Node states` queued (design 671–676): the `Waiting on render.image` line and the three
      // flat placeholder bars. `current.status` is the RAW node status, so a `skipped` node —
      // which shares the queued CARD treatment — never claims to be waiting on anything.
      const document = input.document()
      if (current.status === 'queued' && document !== undefined) {
        const settledUpstreams = new Set<string>()
        for (const upstream of _incomingSources().get(nodeId) ?? []) {
          if (model(upstream).settled()) settledUpstreams.add(upstream)
        }
        const waitingOn = waitingOnField(document, nodeId, settledUpstreams)
        if (waitingOn !== undefined) return { ...base, detail: { kind: 'queued', waitingOn } }
      }

      // `Node states` failed: the two footer actions. `Retry node` re-runs the flow, because that
      // is the only re-execution the engine has. `View trace` has nowhere to go yet: nothing
      // assembles `StackTraceModal`'s props, so the button is left without a handler rather than
      // given one that lies.
      if (base.detail?.kind === 'failed') {
        const failure = base.detail
        return {
          ...base,
          detail: {
            ...failure,
            onRetry: () =>
              retryNode({ nodeId, errorName: failure.errorName, message: failure.message }),
          },
        }
      }

      if (base.state !== 'ok') return base
      const report = _reportNodes().get(nodeId)
      if (report === undefined) return base

      // `## Flow-local output UI`: the registered component fills the inline slot; an absent one
      // falls back to the generic JSON viewer. The resolver already encodes that fallback.
      const Output = resolveOutputComponent(input.extension(), nodeId)
      // The settled `render` card of `Studio — default` (design 195–208) draws BOTH — the output in
      // the well and, in the slot's own 18px caption row, the mono metadata row plus the producing
      // node's name (`imageOut`, 206). `assetMetaParts` emits only what the `AssetDescriptor`
      // carries; the artboard's leading `1024×1024` is a dimension nothing on the wire has, and is
      // not fabricated here. A node with no asset output gets no caption at all.
      const asset = Object.values(report.assets)[0]
      const producedBy = _descriptorNodes().get(nodeId)?.title
      return {
        ...base,
        // `Studio — default` and `2A` both draw a settled card's status as `● ok · 2.1s`.
        statusDot: true,
        outputSlot: {
          content: (
            <Output
              nodeId={nodeId}
              output={{ ...(report.output ?? {}), ...report.assets }}
              surface="card"
              assetUrl={assetUrl}
            />
          ),
          // `2A` puts an accent `inspect` in the caption row's trailing cell where
          // `Studio — default` puts the producing node's name. `NodeOutputSlot` treats them as
          // alternatives and `onInspect` wins, so a card that can open the viewer offers it and one
          // that cannot still names its source.
          onInspect: () => openOutput(nodeId),
          ...(asset === undefined
            ? {}
            : {
                caption: <MetadataRow parts={assetMetaParts(asset)} fontSize={9.5} gap={10} />,
                ...(producedBy === undefined ? {} : { source: producedBy }),
              }),
        },
      }
    }, `${unit}.overlay`)

    const built: CanvasNodeModel = { nodeId, record, status, settled, overlay }
    models.set(nodeId, built)
    return built
  }

  /**
   * The whole collection, for a surface that wants one value rather than a subscription per card.
   *
   * Reading this is a subscription to every node's overlay by construction — a map of values cannot
   * be anything else — which is exactly why a card reads {@link CanvasModel.nodeOverlay}
   * instead.
   */
  const overlays = computed<ReadonlyMap<string, NodeOverlay> | undefined>(() => {
    const nodes = _sessionNodes()
    if (nodes === undefined) return undefined
    const collected = new Map<string, NodeOverlay>()
    for (const nodeId of nodes.keys()) {
      const value = model(nodeId).overlay()
      if (value !== undefined) collected.set(nodeId, value)
    }
    return collected
  }, `${name}.overlays`)

  /**
   * Structure only — and keyed on the model INPUTS, never on the previous output. No overlay, no
   * session and no clock is read here, which is the whole of "an in-flight drag survives a run".
   */
  const nodes = computed<readonly FlowCanvasNode[]>(() => {
    const descriptor = input.descriptor()
    const document = input.document()
    if (descriptor === undefined || document === undefined) return []
    const selectedNodeId = input.selectedNodeId()
    return toCanvasNodes({
      descriptor,
      document,
      ...(selectedNodeId === undefined ? {} : { selectedNodeId }),
      problems: input.problems(),
    })
  }, `${name}.nodes`)

  const edges = computed<readonly FlowCanvasEdge[]>(() => {
    const document = input.document()
    if (document === undefined) return []
    return toCanvasEdges(document, input.problems())
  }, `${name}.edges`)

  return {
    overlays,
    nodes,
    edges,
    nodeOverlay: (nodeId) => model(nodeId).overlay,
  }
}
