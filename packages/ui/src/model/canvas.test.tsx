import type { FlowDocument } from '@jobik/core'
import type { Atom } from '@reatom/core'
import { action, atom, context, sleep, wrap } from '@reatom/core'
import { describe, expect, it } from 'vitest'
import type { MetadataRowProps } from '#canvas/index.js'
import type {
  JobikClient,
  RunStreamEvent,
  SafeFlowDescriptorPayload,
  WireRunReportPayload,
} from '#client/index.js'
import type { FlowUiDescriptor } from '#output/index.js'
import type { NodeOverlay } from '#studio/graphModel.js'
import type { FlowProblemModel } from '#studio/problems.js'
import { NO_PROBLEMS, toFlowProblems } from '#studio/problems.js'
import { toNodeOverlays } from '#studio/runPresenter.js'
import type { RunSession } from '#studio/runSession.js'
import { applyRunEvent, createRunSession } from '#studio/runSession.js'
import type { CanvasOverlaysModel } from './canvas.js'
import { reatomCanvas } from './canvas.js'
import type { RetryState, StudioDeps } from './types.js'

/**
 * The canvas arrays and the node overlays, driven directly rather than through a component.
 *
 * The cases under `the loaded Studio`, `the treatments a real run builds`, `3D — validate`,
 * `` `3B` — retrying a failed node `` and `` `2A` — run history as a navigator `` keep the names
 * they have in `studio/StudioApp/StudioApp.test.tsx`, so the two files can be read side by side
 * until that one is rewritten. What each of them asserted through the DOM is asserted here against
 * the derived value the DOM was drawing; where a case also pinned something only a rendered card
 * can say — the three placeholder bars, a disabled button — that half stays in `StudioApp.test.tsx`
 * and a comment here says so.
 *
 * The cases under `what the derivation is cut for` are new: they are the four things this module
 * exists to fix, and Wave 5's invalidation-count tests are meant to find them already asserted.
 *
 * The shape is `context.start(async …)` with every continuation crossing `wrap`. A bare `await`
 * resumes in the DEFAULT context, where none of these atoms was ever written, and every read after
 * it answers `undefined` (RTM-A04). Nothing here is asynchronous *itself* — the flush is only there
 * to let Reatom's notify queue run, because a subscriber is not called in the same tick as the
 * write that invalidated it.
 */

const DOCUMENT = {
  format: 'jobik.flow',
  version: 1,
  connections: [
    { from: { node: 'start1', field: 'title' }, to: { node: 'render', field: 'title' } },
  ],
  literals: {},
  layout: { start1: { x: 56, y: 248 }, render: { x: 386, y: 150 } },
} as unknown as FlowDocument

const DESCRIPTOR = {
  id: 'publication',
  name: 'publication',
  documentFile: 'flow.jobik.json',
  sourceFile: 'flow.ts',
  startIds: ['start1'],
  nodes: [
    {
      id: 'start1',
      kind: 'start' as const,
      title: 'start',
      input: {
        nodeId: 'start1',
        fields: [
          {
            field: 'title',
            required: true,
            annotation: 'string',
            control: { kind: 'string' as const },
          },
        ],
      },
      output: {
        nodeId: 'start1',
        fields: [{ field: 'title', required: true, annotation: 'string' }],
      },
    },
    {
      id: 'render',
      kind: 'transform' as const,
      title: 'imageOut',
      input: {
        nodeId: 'render',
        fields: [
          {
            field: 'title',
            required: true,
            annotation: 'string',
            control: { kind: 'string' as const },
          },
        ],
      },
      output: {
        nodeId: 'render',
        fields: [
          { field: 'image', required: true, annotation: 'Buffer', asset: { mime: 'image/png' } },
        ],
      },
    },
  ],
} as unknown as SafeFlowDescriptorPayload

const REPORT = {
  flowName: 'publication',
  startId: 'start1',
  runNumber: 219,
  status: 'ok' as const,
  elapsedMs: 2400,
  nodes: [
    {
      nodeId: 'start1',
      status: 'ok' as const,
      elapsedMs: 10,
      output: { title: 't' },
      assets: {},
      error: null,
    },
    {
      nodeId: 'render',
      status: 'ok' as const,
      elapsedMs: 2100,
      output: {},
      assets: {
        image: { type: 'Buffer' as const, mime: 'image/png', bytes: 412_000, id: 'asset-1' },
      },
      error: null,
    },
  ],
  logs: [{ nodeId: 'render', message: 'layout pass complete', at: 310 }],
  error: null,
} as unknown as WireRunReportPayload

const FAILED_REPORT = {
  ...REPORT,
  runNumber: 220,
  status: 'failed' as const,
  nodes: [
    REPORT.nodes[0],
    {
      nodeId: 'render',
      status: 'failed' as const,
      elapsedMs: 800,
      output: null,
      assets: {},
      error: {
        _tag: 'ImageRenderError',
        message: 'Unsupported colour profile in the inlined asset.',
        authored: true,
      },
    },
  ],
} as unknown as WireRunReportPayload

/** A flow of `n` nodes in a line, for the cases that are about how the derivation scales. */
function chainDescriptor(ids: readonly string[]): SafeFlowDescriptorPayload {
  return {
    id: 'chain',
    name: 'chain',
    documentFile: 'flow.jobik.json',
    sourceFile: 'flow.ts',
    startIds: [ids[0]],
    nodes: ids.map((id, index) => ({
      id,
      kind: index === 0 ? 'start' : 'transform',
      title: id,
      input: {
        nodeId: id,
        fields:
          index === 0
            ? []
            : [
                {
                  field: 'value',
                  required: true,
                  annotation: 'string',
                  control: { kind: 'string' },
                },
              ],
      },
      output: { nodeId: id, fields: [{ field: 'value', required: true, annotation: 'string' }] },
    })),
  } as unknown as SafeFlowDescriptorPayload
}

function chainDocument(ids: readonly string[], connected = true): FlowDocument {
  return {
    format: 'jobik.flow',
    version: 1,
    connections: connected
      ? ids.slice(1).map((id, index) => ({
          from: { node: ids[index], field: 'value' },
          to: { node: id, field: 'value' },
        }))
      : [],
    literals: {},
    layout: Object.fromEntries(ids.map((id, index) => [id, { x: index * 320, y: 0 }])),
  } as unknown as FlowDocument
}

function chainReport(ids: readonly string[]): WireRunReportPayload {
  return {
    flowName: 'chain',
    startId: ids[0],
    runNumber: 300,
    status: 'ok' as const,
    elapsedMs: 100,
    nodes: ids.map((id) => ({
      nodeId: id,
      status: 'ok' as const,
      elapsedMs: 10,
      output: { value: 'v' },
      assets: {},
      error: null,
    })),
    logs: [],
    error: null,
  } as unknown as WireRunReportPayload
}

type Surface = 'overlays' | 'nodes' | 'edges'

interface World {
  readonly canvas: CanvasOverlaysModel
  readonly descriptor: Atom<SafeFlowDescriptorPayload | undefined>
  readonly document: Atom<FlowDocument | undefined>
  readonly selectedNodeId: Atom<string | undefined>
  readonly problems: Atom<FlowProblemModel>
  readonly session: Atom<RunSession | undefined>
  readonly running: Atom<boolean>
  readonly retry: Atom<RetryState | undefined>
  readonly extension: Atom<FlowUiDescriptor | undefined>
  /** What `retryNode` and `open` were called with — the two actions the overlays hand out. */
  readonly retried: RetryState[]
  readonly opened: string[]
  /** Every `View trace` press. `openTrace` takes no argument, so the count is the whole record. */
  readonly tracesOpened: { count: number }
  /** Puts a fresh, all-queued session on the canvas, the way `run.start` does. */
  readonly seed: (nodeIds: readonly string[]) => void
  readonly emit: (event: RunStreamEvent) => void
  readonly stop: () => void
}

function createWorld(
  seed: {
    descriptor?: SafeFlowDescriptorPayload
    document?: FlowDocument
    connect?: readonly Surface[]
  } = {},
): World {
  const descriptor = atom<SafeFlowDescriptorPayload | undefined>(
    seed.descriptor ?? DESCRIPTOR,
    'test.descriptor',
  )
  const document = atom<FlowDocument | undefined>(seed.document ?? DOCUMENT, 'test.document')
  const selectedNodeId = atom<string | undefined>(undefined, 'test.selectedNodeId')
  const problems = atom<FlowProblemModel>(NO_PROBLEMS, 'test.problems')
  const session = atom<RunSession | undefined>(undefined, 'test.viewedSession')
  const running = atom(false, 'test.running')
  const retry = atom<RetryState | undefined>(undefined, 'test.retry')
  const extension = atom<FlowUiDescriptor | undefined>(undefined, 'test.extension')

  const retried: RetryState[] = []
  const opened: string[] = []
  const tracesOpened = { count: 0 }
  const retryNode = action((target: RetryState) => {
    retried.push(target)
  }, 'test.retryNode')
  const openOutput = action((nodeId: string) => {
    opened.push(nodeId)
  }, 'test.openOutput')
  const openTrace = action(() => {
    tracesOpened.count += 1
  }, 'test.openTrace')

  const deps: StudioDeps = {
    client: {
      assetUrl: (asset: { id: string }) => `/api/assets/${asset.id}`,
    } as unknown as JobikClient,
  }

  const canvas = reatomCanvas(
    deps,
    {
      descriptor,
      document,
      selectedNodeId,
      problems,
      viewedSession: session,
      running,
      retry,
      retryNode,
      extension,
      openOutput,
      openTrace,
    },
    'studio.canvas',
  )

  // What `@reatom/react` does for the real Studio: the surfaces read these, which connects
  // everything derived behind them.
  const connect = seed.connect ?? (['overlays', 'nodes', 'edges'] as const)
  const unsubscribes = [
    connect.includes('overlays') ? canvas.overlays.subscribe(() => {}) : () => {},
    connect.includes('nodes') ? canvas.nodes.subscribe(() => {}) : () => {},
    connect.includes('edges') ? canvas.edges.subscribe(() => {}) : () => {},
  ]

  return {
    canvas,
    descriptor,
    document,
    selectedNodeId,
    problems,
    session,
    running,
    retry,
    extension,
    retried,
    opened,
    tracesOpened,
    seed: (nodeIds) => {
      session.set(createRunSession({ startId: 'start1', nodeIds, startedAt: 1000 }))
    },
    emit: (event) => {
      const current = session()
      if (current === undefined) throw new Error('seed the session before emitting into it')
      session.set(applyRunEvent(current, event))
    },
    stop: () => {
      for (const unsubscribe of unsubscribes) unsubscribe()
    },
  }
}

function inFrame(body: (world: World) => Promise<void>, world: () => World): Promise<void> {
  return wrap(
    context.start(async () => {
      const built = world()
      try {
        await body(built)
      } finally {
        built.stop()
      }
    }),
  )
}

/**
 * A macrotask boundary. Reatom notifies subscribers off a queue rather than inside the write, so an
 * assertion about how often a unit was invalidated has to let that queue run first.
 */
function flush(): Promise<unknown> {
  return wrap(sleep(0))
}

/** The overlay of one node, as a card reads it. */
function overlayOf(world: World, nodeId: string): NodeOverlay | undefined {
  return world.canvas.nodeOverlay(nodeId)()
}

describe('the loaded Studio', () => {
  it('draws both node cards and the one connecting edge on the canvas', async () => {
    await inFrame(async ({ canvas }) => {
      expect(canvas.nodes().map((node) => node.id)).toEqual(['start1', 'render'])
      expect(canvas.nodes().map((node) => node.position)).toEqual([
        { x: 56, y: 248 },
        { x: 386, y: 150 },
      ])
      expect(canvas.edges()).toHaveLength(1)
      expect(canvas.edges().at(0)).toMatchObject({
        source: 'start1',
        sourceField: 'title',
        target: 'render',
        targetField: 'title',
      })
    }, createWorld)
  })
})

describe('the treatments a real run builds', () => {
  // `Node states` queued (design 671–676): `Waiting on render.image` over three flat bars. The
  // upstream `node.field` comes from the document's own connection list — here `start1.title`. The
  // three bars are `NodeStateBody`'s own default for a `queued` detail and stay asserted in
  // `StudioApp.test.tsx`; what the model owes the card is the line.
  it('gives a queued node the Waiting on line and the three placeholder bars', async () => {
    await inFrame(async (world) => {
      world.seed(['start1', 'render'])
      await flush()

      expect(overlayOf(world, 'render')?.detail).toEqual({
        kind: 'queued',
        waitingOn: 'start1.title',
      })
      // `start1` has no incoming connection, so there is nothing honest to name: no line at all.
      expect(overlayOf(world, 'start1')?.detail).toBeUndefined()
    }, createWorld)
  })

  // `Studio — default` ok (design 204–208): the inline slot's caption row is the mono metadata
  // row, beside the flow-local component the slot already holds. Only what the `AssetDescriptor`
  // carries — the artboard's `1024×1024` is a dimension no descriptor has.
  it('captions a settled ok node with the descriptor’s own mime and size', async () => {
    await inFrame(async (world) => {
      world.seed(['start1', 'render'])
      world.emit({ type: 'run-settled', report: REPORT })
      await flush()

      const overlay = overlayOf(world, 'render')
      expect(overlay?.state).toBe('ok')
      expect(overlay?.statusDot).toBe(true)
      const caption = overlay?.outputSlot?.caption as { props: MetadataRowProps } | undefined
      expect(caption?.props.parts).toEqual(['png', '402 kb'])
      // `2A` replaces `Studio — default`'s producing-node name with an accent `inspect` that opens
      // the output dock. The model states both and `NodeOutputSlot` picks; the newer artboard wins
      // there, which is what `StudioApp.test.tsx` still asserts through the DOM.
      expect(overlay?.outputSlot?.source).toBe('imageOut')
      overlay?.outputSlot?.onInspect?.()
      expect(world.opened).toEqual(['render'])
    }, createWorld)
  })
})

describe('3D — validate', () => {
  const MISMATCH = () =>
    toFlowProblems({
      error: {
        _tag: 'ConnectionError',
        message: "required input field 'render.title' is neither connected nor given a literal",
        from: null,
        to: { node: 'render', field: 'title' },
      },
      document: DOCUMENT,
    })

  it('marks both ends of the failing connection, and nothing else', async () => {
    await inFrame(async (world) => {
      world.problems.set(MISMATCH())
      await flush()

      const cards = new Map(world.canvas.nodes().map((node) => [node.id, node.data]))
      // `render.title` IS connected in DOCUMENT, so the port keeps its declared type and is marked
      // as a mismatch — scoped to the card the finding names, since `start1` has a `title` too.
      expect(cards.get('render')?.inputs).toEqual([
        { name: 'title', annotation: 'string', problem: 'mismatch' },
      ])
      // The sending end of the same connection is marked as well: `3D` marks the port, its type
      // label, the edge and the node border.
      expect(cards.get('start1')?.outputs).toEqual([
        { name: 'title', annotation: 'string', problem: 'linked' },
      ])
      // `start1`'s own unconnected input is not part of the finding and stays untouched.
      expect(cards.get('start1')?.inputs).toEqual([{ name: 'title', annotation: 'string' }])
      expect(cards.get('render')?.problem).toBe('error')
      expect(world.canvas.edges().at(0)?.tone).toBe('error')
    }, createWorld)
  })

  it('says `no source` on a port the document leaves unconnected', async () => {
    await inFrame(async (world) => {
      world.problems.set(
        toFlowProblems({
          error: {
            _tag: 'ConnectionError',
            message: "required input field 'start1.title' is neither connected nor given a literal",
            from: null,
            // Nothing in DOCUMENT connects into `start1`, so this port genuinely has no source —
            // which is the whole difference between the artboard's two failure treatments.
            to: { node: 'start1', field: 'title' },
          },
          document: DOCUMENT,
        }),
      )
      await flush()

      const cards = new Map(world.canvas.nodes().map((node) => [node.id, node.data]))
      expect(cards.get('start1')?.inputs).toEqual([
        { name: 'title', annotation: 'no source', problem: 'unsourced' },
      ])
      expect(cards.get('start1')?.problem).toBe('blocked')
    }, createWorld)
  })
})

describe('`3B` — retrying a failed node', () => {
  /** A failed run, then the retry it produces: a fresh all-queued session under `running`. */
  async function retryFrom(world: World): Promise<void> {
    world.seed(['start1', 'render'])
    world.emit({ type: 'run-settled', report: FAILED_REPORT })
    await flush()

    const failure = overlayOf(world, 'render')?.detail
    if (failure?.kind !== 'failed') throw new Error('the failed run produced no failed detail')
    failure.onRetry?.()

    const target = world.retried.at(-1)
    if (target === undefined) throw new Error('`Retry node` asked for no run')
    world.retry.set(target)
    world.running.set(true)
    world.seed(['start1', 'render'])
    await flush()
  }

  /**
   * F-M2. `View trace` used to be handed no handler at all, so `3C`'s Stack trace dialog had no
   * render site and one of the four modals could not be seen in the running app. It reaches
   * `RunPanelModel.openTrace`, which takes no argument: the dialog draws the run's failure, and the
   * card offering the action *is* that failure's card.
   */
  it('gives the failed card a View trace that opens the stack trace dialog', async () => {
    await inFrame(async (world) => {
      world.seed(['start1', 'render'])
      world.emit({ type: 'run-settled', report: FAILED_REPORT })
      await flush()

      const failure = overlayOf(world, 'render')?.detail
      if (failure?.kind !== 'failed') throw new Error('the failed run produced no failed detail')
      expect(world.tracesOpened.count).toBe(0)

      failure.onViewTrace?.()
      expect(world.tracesOpened.count).toBe(1)
    }, createWorld)
  })

  it('starts a run and puts the card into the retrying state', async () => {
    await inFrame(async (world) => {
      world.seed(['start1', 'render'])
      world.emit({ type: 'run-settled', report: FAILED_REPORT })
      await flush()

      const failure = overlayOf(world, 'render')?.detail
      expect(failure).toMatchObject({ kind: 'failed', errorName: 'ImageRenderError' })
      if (failure?.kind !== 'failed') throw new Error('unreachable')
      // The engine has no per-node re-execution, so `Retry node` starts the same run `Re-run` does
      // — the card only says which node asked, and with which failure.
      failure.onRetry?.()
      expect(world.retried).toEqual([
        {
          nodeId: 'render',
          errorName: 'ImageRenderError',
          message: 'Unsupported colour profile in the inlined asset.',
        },
      ])

      world.retry.set(world.retried[0])
      world.running.set(true)
      world.seed(['start1', 'render'])
      await flush()

      // `3B`: the header swaps its dot for the spinner and the status word becomes `retrying`.
      expect(overlayOf(world, 'render')?.state).toBe('retrying')
      expect(overlayOf(world, 'render')?.status).toBe('retrying')
      // And nothing else on the canvas is retrying: `start1` is queued like any other new run.
      expect(overlayOf(world, 'start1')?.state).toBe('queued')
    }, createWorld)
  })

  it('keeps the failure it is retrying from on screen, with both actions dimmed', async () => {
    await inFrame(async (world) => {
      // `wrap`, because an await on a test helper loses the frame exactly as any other does.
      await wrap(retryFrom(world))

      // The error well survives the retry: the card still says what it is retrying *from*.
      const detail = overlayOf(world, 'render')?.detail
      expect(detail).toEqual({
        kind: 'failed',
        errorName: 'ImageRenderError',
        message: 'Unsupported colour profile in the inlined asset.',
        retrying: true,
      })
      // `retrying: true` is the model's half of the dimming, and the absent `onRetry` is why a
      // second press cannot land; `StudioApp.test.tsx` keeps the assertion that both buttons are
      // actually disabled.
      if (detail?.kind !== 'failed') throw new Error('unreachable')
      expect(detail.onRetry).toBeUndefined()
    }, createWorld)
  })

  it('leaves the retry behind once the run it started has settled', async () => {
    await inFrame(async (world) => {
      // `wrap`, because an await on a test helper loses the frame exactly as any other does.
      await wrap(retryFrom(world))

      // The second run failed too, so the card is back to a plain `failed` — not still retrying.
      world.emit({ type: 'run-settled', report: FAILED_REPORT })
      world.running.set(false)
      await flush()

      const overlay = overlayOf(world, 'render')
      expect(overlay?.state).toBe('failed')
      const detail = overlay?.detail
      expect(detail).toMatchObject({ kind: 'failed', errorName: 'ImageRenderError' })
      if (detail?.kind !== 'failed') throw new Error('unreachable')
      expect(detail.retrying).toBeUndefined()
      // And it can be pressed again, which is the whole of "the retry is behind it".
      expect(detail.onRetry).toBeTypeOf('function')
    }, createWorld)
  })
})

describe('`2A` — run history as a navigator', () => {
  it('brings an earlier run back onto the dock and the canvas', async () => {
    await inFrame(async (world) => {
      world.seed(['start1', 'render'])
      world.emit({ type: 'run-settled', report: FAILED_REPORT })
      await flush()
      expect(overlayOf(world, 'render')?.state).toBe('failed')

      // What `viewedSession` does when a `Run history` row is picked: another whole session, which
      // the canvas projects exactly as it projects the live one.
      const earlier = applyRunEvent(
        createRunSession({ startId: 'start1', nodeIds: ['start1', 'render'], startedAt: 1 }),
        { type: 'run-settled', report: REPORT },
      )
      world.session.set(earlier)
      await flush()

      // The canvas is that run's too: `#219` settled both nodes, so both still read `ok`.
      expect(overlayOf(world, 'start1')?.state).toBe('ok')
      expect(overlayOf(world, 'render')?.state).toBe('ok')
      expect(overlayOf(world, 'render')?.elapsed).toBe('2.1s')
    }, createWorld)
  })
})

/**
 * `Studio — run in progress` (design 1721–1724) draws two tones at once: the accent `5 7` dash
 * marching into the running node, and the quiet `3 5` dash into the queued one. `4A`'s coverage row
 * adds the rule the code has to satisfy — *"the dashed 0.8 s march is a loop, not a transition, and
 * stops the moment the run ends."*
 *
 * Both of these are read by the edge pointing at the node, so they are asserted here on the target's
 * own accessor. The `.active` class carries the keyframe, so "stops" is not a timer anywhere: it is
 * the tone reverting to `undefined`, which is the last case below.
 */
describe('`4A` — the edge march', () => {
  it('marches into the running node, waits into the queued one, and stops when the run ends', async () => {
    await inFrame(async (world) => {
      // Idle: nothing seeded, so the run says nothing and both edges keep the document's tone.
      expect(world.canvas.incomingEdgeTone('render')()).toBeUndefined()

      world.seed(['start1', 'render'])
      world.emit({
        type: 'node-status',
        nodeId: 'start1',
        status: 'running',
        elapsedMs: 0,
        error: null,
      })
      await flush()

      expect(world.canvas.incomingEdgeTone('start1')()).toBe('active')
      // `render` has not been reached yet, so the edge into it is the static waiting dash.
      expect(world.canvas.incomingEdgeTone('render')()).toBe('waiting')

      world.emit({
        type: 'node-status',
        nodeId: 'start1',
        status: 'ok',
        elapsedMs: 10,
        error: null,
      })
      world.emit({
        type: 'node-status',
        nodeId: 'render',
        status: 'running',
        elapsedMs: 0,
        error: null,
      })
      await flush()

      // The march moves with the run rather than accumulating behind it.
      expect(world.canvas.incomingEdgeTone('start1')()).toBeUndefined()
      expect(world.canvas.incomingEdgeTone('render')()).toBe('active')

      world.emit({ type: 'run-settled', report: REPORT })
      await flush()

      // The stop condition, and the whole of it: no tone, so no `.active`, so no loop.
      expect(world.canvas.incomingEdgeTone('start1')()).toBeUndefined()
      expect(world.canvas.incomingEdgeTone('render')()).toBeUndefined()
    }, createWorld)
  })

  it('caches the tone per node, so the edge array never has to be rebuilt for it', async () => {
    await inFrame(async (world) => {
      expect(world.canvas.incomingEdgeTone('render')).toBe(world.canvas.incomingEdgeTone('render'))
      expect(world.canvas.incomingEdgeTone('render')).not.toBe(
        world.canvas.incomingEdgeTone('start1'),
      )
    }, createWorld)
  })
})

/**
 * The four measured problems this module was written to fix. Every case below is about *how often*
 * something is derived, not about what it derives.
 */
describe('what the derivation is cut for', () => {
  const CHAIN = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5']

  it('never invalidates the node array across a whole run', async () => {
    await inFrame(
      async (world) => {
        let nodeArrays = 0
        let edgeArrays = 0
        const stop = [
          world.canvas.nodes.subscribe(() => {
            nodeArrays += 1
          }),
          world.canvas.edges.subscribe(() => {
            edgeArrays += 1
          }),
        ]
        const first = world.canvas.nodes()
        expect([nodeArrays, edgeArrays]).toEqual([1, 1])

        world.seed(CHAIN)
        world.emit({
          type: 'run-started',
          runNumber: 300,
          flowName: 'chain',
          startId: 'n0',
          nodeCount: CHAIN.length,
        })
        for (const nodeId of CHAIN) {
          world.emit({ type: 'node-status', nodeId, status: 'running', elapsedMs: 0, error: null })
          world.emit({ type: 'node-log', line: { nodeId, message: 'working', at: 1010 } })
          world.emit({ type: 'node-status', nodeId, status: 'ok', elapsedMs: 10, error: null })
          await flush()
        }
        world.emit({ type: 'run-settled', report: chainReport(CHAIN) })
        await flush()

        // The overlays did move — this is a real run, not a still one.
        expect(overlayOf(world, 'n3')?.state).toBe('ok')
        // `FlowCanvas` syncs its internal node state from the ARRAY IDENTITY of these two props, so
        // one extra notification here is an in-flight drag reset under the pointer.
        expect([nodeArrays, edgeArrays]).toEqual([1, 1])
        expect(world.canvas.nodes()).toBe(first)

        for (const unsubscribe of stop) unsubscribe()
      },
      () => createWorld({ descriptor: chainDescriptor(CHAIN), document: chainDocument(CHAIN) }),
    )
  })

  it('invalidates one node’s overlay on a node-status line, and no other’s', async () => {
    await inFrame(
      async (world) => {
        world.seed(CHAIN)
        await flush()

        const seen: Record<string, number> = {}
        const stop = CHAIN.map((nodeId) => {
          seen[nodeId] = 0
          return world.canvas.nodeOverlay(nodeId).subscribe(() => {
            seen[nodeId] = (seen[nodeId] ?? 0) + 1
          })
        })
        await flush()
        expect(seen).toEqual({ n0: 1, n1: 1, n2: 1, n3: 1, n4: 1, n5: 1 })

        // `n0` starts. `n1` is queued on it, but what a queued card asks its upstream is whether it
        // has *settled* — and it has not — so the line about `n0` reaches `n0`'s card alone.
        world.emit({
          type: 'node-status',
          nodeId: 'n0',
          status: 'running',
          elapsedMs: 0,
          error: null,
        })
        await flush()
        expect(seen).toEqual({ n0: 2, n1: 1, n2: 1, n3: 1, n4: 1, n5: 1 })

        // A log line touches the session and no node at all.
        world.emit({ type: 'node-log', line: { nodeId: 'n0', message: 'working', at: 1010 } })
        await flush()
        expect(seen).toEqual({ n0: 2, n1: 1, n2: 1, n3: 1, n4: 1, n5: 1 })

        // `n0` settles. Its own card changes, and so does `n1`'s — which was queued on it and now
        // names the next connection it is blocked on. `n2`…`n5` are not downstream of anything that
        // moved and are left alone.
        world.emit({ type: 'node-status', nodeId: 'n0', status: 'ok', elapsedMs: 10, error: null })
        await flush()
        expect(seen).toEqual({ n0: 3, n1: 2, n2: 1, n3: 1, n4: 1, n5: 1 })

        for (const unsubscribe of stop) unsubscribe()
      },
      () => createWorld({ descriptor: chainDescriptor(CHAIN), document: chainDocument(CHAIN) }),
    )
  })

  it('keeps one overlay computed per node id, however often the collection is rebuilt', async () => {
    await inFrame(
      async (world) => {
        world.seed(CHAIN)
        await flush()
        const first = world.canvas.nodeOverlay('n2')

        for (const nodeId of CHAIN) {
          world.emit({ type: 'node-status', nodeId, status: 'ok', elapsedMs: 10, error: null })
          await flush()
        }

        // RTM-S07: a model factory called straight from a `computed` rebuilds every model on every
        // recomputation and silently throws its state away. The cache is what stops that.
        expect(world.canvas.nodeOverlay('n2')).toBe(first)
        expect(first()?.state).toBe('ok')
      },
      () => createWorld({ descriptor: chainDescriptor(CHAIN), document: chainDocument(CHAIN) }),
    )
  })

  it('indexes the report and the descriptor once each, not once per node', async () => {
    async function reads(ids: readonly string[]): Promise<{ descriptor: number; report: number }> {
      let descriptorReads = 0
      let reportReads = 0
      const nodes = chainDescriptor(ids).nodes
      const descriptor = { ...chainDescriptor(ids) }
      Object.defineProperty(descriptor, 'nodes', {
        enumerable: true,
        get: () => {
          descriptorReads += 1
          return nodes
        },
      })
      const built = chainReport(ids)
      const report = { ...built }
      Object.defineProperty(report, 'nodes', {
        enumerable: true,
        get: () => {
          reportReads += 1
          return built.nodes
        },
      })

      await inFrame(
        async (world) => {
          world.seed(ids)
          await flush()
          // `applyRunEvent` reads `report.nodes` itself; the count is taken after that, so what is
          // measured is only what deriving the overlays costs.
          world.emit({ type: 'run-settled', report: report as WireRunReportPayload })
          descriptorReads = 0
          reportReads = 0
          await flush()
          expect(world.canvas.overlays()?.size).toBe(ids.length)
        },
        () =>
          createWorld({
            descriptor: descriptor as SafeFlowDescriptorPayload,
            document: chainDocument(ids),
            // Only the overlays: `toCanvasNodes` reads `descriptor.nodes` on its own account, and
            // that read is once per array, not once per node, so it is not what is under test here.
            connect: ['overlays'],
          }),
      )

      return { descriptor: descriptorReads, report: reportReads }
    }

    const small = await reads(['n0', 'n1'])
    const large = await reads(CHAIN)
    // The old shape did `report.nodes.find(…)` and `descriptor.nodes.find(…)` per node, per frame:
    // two O(n²) scans, and two counts that would grow with the flow.
    expect(large).toEqual(small)
  })

  /**
   * Nothing renders from `toNodeOverlays` any more — `StudioApp` hands the canvas `canvas.nodes`,
   * and a card asks `canvas.nodeOverlay(id)` for its own decoration — so this case is no longer
   * holding a live second reading against this one. It is kept, and renamed, because the two
   * spellings still both exist: `toNodeOverlays` takes a whole `RunSession` and cannot be split per
   * node, which is why this module restates `SETTLED_WITH_TIME`, `annotationsFor` and `toCardState`
   * in the first place, and its own six cases in `studio/runPresenter.test.ts` state several of
   * these rules against a plain function rather than through a live model. Collapsing the two means
   * moving those six cases into a model test — a `studio/` sweep — and until someone does, this is
   * the only thing that would notice the two drifting apart.
   */
  it('agrees with toNodeOverlays, the whole-session spelling it was split out of', async () => {
    const ids = ['a', 'b', 'c', 'd']
    await inFrame(
      async (world) => {
        world.seed(ids)
        world.emit({
          type: 'node-status',
          nodeId: 'b',
          status: 'running',
          elapsedMs: 0,
          error: null,
        })
        world.emit({
          type: 'node-status',
          nodeId: 'c',
          status: 'skipped',
          elapsedMs: 0,
          error: null,
        })
        world.emit({
          type: 'node-status',
          nodeId: 'd',
          status: 'cached',
          elapsedMs: 40,
          error: null,
        })
        await flush()

        const session = world.session()
        if (session === undefined) throw new Error('unreachable')
        // Split per node rather than per session, so `runPresenter.toNodeOverlays` could not be
        // reused — it takes a whole `RunSession`, and that file is not this task's to change. This is
        // what holds the two spellings together until `StudioApp` stops needing the other one.
        expect(world.canvas.overlays()).toEqual(toNodeOverlays(session))
      },
      () =>
        // No connections at all: a queued card's `Waiting on` line and the settled report's inline
        // slot are the two enrichments `toNodeOverlays` does not make, and neither applies here.
        createWorld({ descriptor: chainDescriptor(ids), document: chainDocument(ids, false) }),
    )
  })
})

it('fills the inline output slot before the complete run report arrives', async () => {
  await inFrame(async (world) => {
    world.seed(['start1', 'render'])
    world.emit({
      type: 'run-started',
      runNumber: REPORT.runNumber,
      flowName: 'publication',
      startId: 'start1',
      nodeCount: 2,
    })
    world.emit({ type: 'node-settled', runNumber: REPORT.runNumber, node: REPORT.nodes[1] })
    expect(world.session()?.report).toBeUndefined()
    expect(overlayOf(world, 'render')?.outputSlot?.content).toBeDefined()
    overlayOf(world, 'render')?.outputSlot?.onInspect?.()
    expect(world.opened).toEqual(['render'])
  }, createWorld)
})
