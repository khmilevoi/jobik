import type { FlowDocument } from '@jobik/core'
import { context, sleep, wrap } from '@reatom/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  JobikClient,
  RunStreamEvent,
  SafeFlowDescriptorPayload,
  WireRunReportPayload,
} from '#client/index.js'
import type { RunPanelState, RunRunningState } from '#run/index.js'
import { reatomStudio } from './studio.js'
import type { StudioDeps, StudioModel } from './types.js'

/**
 * The performance thesis, asserted against the **composed** Studio.
 *
 * The plan this refactor followed states three claims and says plainly that without them the whole
 * churn is unverified:
 *
 *  * **(a)** a `node-status` event for node X invalidates node X's overlay computed and no other
 *    node's;
 *  * **(b)** an `elapsedMs` tick invalidates neither the run log computed nor any node timing
 *    computed;
 *  * **(c)** `canvasNodes` is invalidated **zero times** across a whole run.
 *
 * All three are already asserted somewhere — (a) and (c) in `model/canvas.test.tsx`, (b) in
 * `model/runPanel.test.ts` — and those cases stay where they are, because each of them also pins
 * the *mechanism* of its own module: the `viewedSession → _sessionNodes → node#id.record →
 * node#id.overlay` chain, the `settled()` boolean a queued card asks its upstreams for, the two
 * units a tick is allowed to reach. **What none of them can say is that the claim survives
 * composition.** Each drives one sub-model over hand-built input atoms; the claim is about the
 * Studio, and a sub-model in isolation cannot make it. So every case below builds a real
 * `reatomStudio`, loads a real flow through a stub client, and streams a real run into it — the
 * canvas reading `run.viewedSession` through `studio.ts`'s own wiring, the panel reading the same
 * run's clock, the ticker running for real off `withConnectHook`.
 *
 * **Counts, never wall-clock timings.** A timing assertion is flaky in CI and this repo runs vitest
 * under load. Every number here is how many times a subscriber was notified, or how many distinct
 * object identities a projection published — which is the same measurement, since every one of
 * these derivations builds a fresh object when it recomputes.
 *
 * ## Two rules the whole file depends on
 *
 * **Every `await` crosses `wrap`.** `context.start(async …)` does not hold its frame across a bare
 * `await`: the continuation resumes in the default global context, where none of these atoms was
 * ever written, and every read after it answers `undefined` with no error at all (RTM-A04). That
 * includes awaits on the helpers below, which is why {@link mounted} and {@link until} return
 * `wrap(…)`'s promise rather than being `async` functions of their own.
 *
 * **Every unit under test is subscribed.** A computed is pull-based: unsubscribed, it advances only
 * when something reads it, and an invalidation count taken over that is meaningless. {@link connect}
 * subscribes to what a mounted Studio subscribes to, and each case adds its own counters on top.
 *
 * The React-level counterpart to (a) is `canvas/NodeCard/NodeCard.test.tsx`'s *re-renders the card a
 * node-status line is about, and no other*, which counts commits through two `<Profiler>`s. This
 * file stops at the model; that one carries the same claim through to the DOM.
 */

/** `n0 ─▶ n1 ─▶ … ` — a chain, so exactly one node is in flight at a time. */
const CHAIN = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5'] as const

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

function chainDocument(ids: readonly string[]): FlowDocument {
  return {
    format: 'jobik.flow',
    version: 1,
    connections: ids.slice(1).map((id, index) => ({
      from: { node: ids[index], field: 'value' },
      to: { node: id, field: 'value' },
    })),
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

/**
 * A run stream the case drives line by line, and holds open for as long as it likes.
 *
 * `model/run.ts` iterates the generator by hand so that every continuation crosses `wrap`; nothing
 * in here touches a unit, so the `await` below is free to resume wherever it likes.
 */
interface StreamDriver {
  readonly open: () => AsyncGenerator<RunStreamEvent>
  readonly push: (event: RunStreamEvent) => void
  readonly end: () => void
}

function streamDriver(): StreamDriver {
  const queue: RunStreamEvent[] = []
  let closed = false
  let wake = (): void => {}
  let waiting = new Promise<void>((resolve) => {
    wake = resolve
  })
  const bump = (): void => {
    const previous = wake
    waiting = new Promise<void>((resolve) => {
      wake = resolve
    })
    previous()
  }

  return {
    open: async function* open() {
      while (true) {
        const next = queue.shift()
        if (next !== undefined) {
          yield next
          continue
        }
        if (closed) return
        await waiting
      }
    },
    push: (event) => {
      queue.push(event)
      bump()
    },
    end: () => {
      closed = true
      bump()
    },
  }
}

function stubClient(overrides: Partial<JobikClient> = {}): JobikClient {
  return {
    listFlows: async () => [{ id: 'chain', name: 'chain', nodeCount: CHAIN.length }],
    loadFlow: async () => ({
      descriptor: chainDescriptor(CHAIN),
      document: chainDocument(CHAIN),
      revision: 'rev-1',
    }),
    validate: async () => ({ valid: true }),
    save: async () => ({ revision: 'rev-2' }),
    startRun: async () => streamDriver().open(),
    cancelRun: async () => true,
    assetUrl: (asset: { readonly id: string }) => `/api/assets/${asset.id}`,
    extensionBundleUrl: () => '/api/flows/chain/ui.js',
    ...overrides,
  } as unknown as JobikClient
}

/**
 * `model/extension.ts` fetches the flow-local bundle from the global `fetch`, and an `ok` card reads
 * the descriptor it produces. Nothing here is about the flow-local renderer, so the fetch answers a
 * 404 and every settled card falls back to the generic viewer — which is the branch the overlays
 * take in every case below.
 */
function stubBundleFetch(): void {
  vi.stubGlobal('fetch', async () => ({ ok: false, status: 404, text: async () => '' }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * What a mounted Studio subscribes to.
 *
 * `canvas.overlays` is deliberately absent and `canvas.nodeOverlay` deliberately present: reading
 * the map is a subscription to every node's overlay by construction, and the whole point of the
 * accessor — and of claim (a) — is that a card does not do that.
 */
function connect(model: StudioModel): () => void {
  const unsubscribe = [
    model.flows.flows.subscribe(() => {}),
    model.flows.descriptor.subscribe(() => {}),
    model.draft.document.subscribe(() => {}),
    model.inputs.startId.subscribe(() => {}),
    model.inputs.presentation.subscribe(() => {}),
    model.validation.topBar.subscribe(() => {}),
    model.run.session.subscribe(() => {}),
    model.run.history.subscribe(() => {}),
    model.output.viewerNodeId.subscribe(() => {}),
    model.canvas.nodes.subscribe(() => {}),
    model.canvas.edges.subscribe(() => {}),
    model.runPanel.state.subscribe(() => {}),
    model.shortcuts.bound.subscribe(() => {}),
  ]
  return () => {
    for (const off of unsubscribe) off()
  }
}

const macrotask = (): Promise<unknown> => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * A macrotask boundary. Reatom notifies subscribers off a queue rather than inside the write, so a
 * count of how often a unit was invalidated has to let that queue run first.
 */
function flush(): Promise<unknown> {
  return wrap(macrotask())
}

/** Drives the frame until `predicate` holds. Call it as `await wrap(until(…))`. */
async function until(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) return
    await wrap(macrotask())
  }
  throw new Error(`timed out waiting for ${label}`)
}

/**
 * The same, for something a 100ms loop has to deliver rather than a promise chain.
 *
 * It waits on a *count* rather than on the wall clock, which is the whole reason it exists: a
 * `sleep(260)` and an assertion that two ticks landed in it is a timing assertion, and this repo
 * runs vitest under load. This one waits as long as it must and asserts nothing about how long.
 */
async function untilAtLeast(count: () => number, wanted: number, label: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (count() >= wanted) return
    await wrap(sleep(20))
  }
  throw new Error(`timed out waiting for ${label}`)
}

interface World {
  readonly model: StudioModel
  readonly stream: StreamDriver
  /** The injected clock, movable so the running readout has something new to print. */
  readonly clock: { value: number }
}

/**
 * One isolated Reatom frame, one composed Studio in it, one run stream under the case's control.
 *
 * `reatomStudio` is called with the real `deps` shape `StudioApp` builds, so nothing below is a
 * sub-model driven through stand-in atoms: `canvas` reads the `run` this `runPanel` reads, through
 * the wiring in `studio.ts`.
 */
function inFrame(
  body: (world: World) => Promise<void>,
  options: { client?: (stream: StreamDriver) => JobikClient } = {},
): Promise<void> {
  stubBundleFetch()
  const stream = streamDriver()
  const clock = { value: 1_000 }
  const client =
    options.client === undefined
      ? stubClient({ startRun: async () => stream.open() })
      : options.client(stream)
  const deps: StudioDeps = { client, now: () => clock.value }

  return wrap(
    context.start(async () => {
      const model = reatomStudio(deps, 'studio')
      const off = connect(model)
      try {
        await wrap(body({ model, stream, clock }))
      } finally {
        off()
        stream.end()
      }
    }),
  )
}

/**
 * The mount every case starts from: the one flow listed, loaded, and its start seeded.
 *
 * It returns `wrap(…)`'s promise rather than an `async` function's, and that is load-bearing — an
 * `await` on a bare promise resumes outside the frame `context.start` opened.
 */
function mounted(model: StudioModel): Promise<void> {
  return wrap(until(() => model.flows.descriptor() !== undefined, 'the first flow to load'))
}

/** Starts the run and waits for the seeded session, without waiting for it to settle. */
function started(world: World): Promise<void> {
  void world.model.run.start({})
  return wrap(until(() => world.model.run.running(), 'the run to be in flight'))
}

function runningOf(state: RunPanelState | undefined): RunRunningState {
  if (state?.kind !== 'running') {
    throw new Error(`expected running, got ${state?.kind ?? 'nothing'}`)
  }
  return state
}

const RUN_STARTED = {
  type: 'run-started',
  runNumber: 300,
  flowName: 'chain',
  startId: 'n0',
  nodeCount: CHAIN.length,
} as RunStreamEvent

const status = (nodeId: string, state: 'running' | 'ok'): RunStreamEvent =>
  ({
    type: 'node-status',
    nodeId,
    status: state,
    elapsedMs: state === 'ok' ? 10 : 0,
    error: null,
  }) as RunStreamEvent

/**
 * Claim (a). Perf problem #1: one `session` object was replaced per stream event, so `overlays`
 * re-ran whole and every card on the canvas got a new overlay whether or not the line was about it.
 */
describe('a node-status line, and the one card it is about', () => {
  it('invalidates that node’s overlay and no other node’s, in the composed Studio', async () => {
    await inFrame(async (world) => {
      await mounted(world.model)
      await started(world)
      world.stream.push(RUN_STARTED)
      await flush()

      // Every node of the chain is in this run's graph, so every card has an overlay to invalidate.
      expect([...(world.model.run.session()?.nodes.keys() ?? [])]).toEqual([...CHAIN])

      const seen: Record<string, number> = {}
      const stop = CHAIN.map((nodeId) => {
        seen[nodeId] = 0
        return world.model.canvas.nodeOverlay(nodeId).subscribe(() => {
          seen[nodeId] = (seen[nodeId] ?? 0) + 1
        })
      })
      await flush()
      expect(seen).toEqual({ n0: 1, n1: 1, n2: 1, n3: 1, n4: 1, n5: 1 })

      // `n0` starts. `n1` is queued on it — but what a queued card asks its upstream is whether it
      // has *settled*, and it has not, so the line about `n0` reaches `n0`'s card alone.
      world.stream.push(status('n0', 'running'))
      await flush()
      expect(seen).toEqual({ n0: 2, n1: 1, n2: 1, n3: 1, n4: 1, n5: 1 })

      // A log line replaces the session and leaves its node map alone, so it stops at
      // `_sessionNodes` and reaches no card at all.
      world.stream.push({
        type: 'node-log',
        line: { nodeId: 'n0', message: 'working', at: 1_010 },
      } as RunStreamEvent)
      await flush()
      expect(seen).toEqual({ n0: 2, n1: 1, n2: 1, n3: 1, n4: 1, n5: 1 })

      // `n0` settles. Its own card changes, and so does `n1`'s — which was queued on it and now
      // names the next connection it is blocked on. `n2`…`n5` are downstream of nothing that moved.
      world.stream.push(status('n0', 'ok'))
      await flush()
      expect(seen).toEqual({ n0: 3, n1: 2, n2: 1, n3: 1, n4: 1, n5: 1 })

      // ...and the run really did move under all of that. `n1` is still queued, and still waiting
      // on the same field — the second notification it took is a rebuilt overlay object, which is
      // exactly what a card downstream of a node that settled has to be told about.
      expect(world.model.canvas.nodeOverlay('n0')()?.state).toBe('ok')
      expect(world.model.canvas.nodeOverlay('n1')()).toMatchObject({
        state: 'queued',
        detail: { kind: 'queued', waitingOn: 'n0.value' },
      })

      for (const unsubscribe of stop) unsubscribe()
      world.stream.end()
      await wrap(until(() => !world.model.run.running(), 'the run to end'))
    })
  })
})

/**
 * Claim (b). Perf problem #2: `runPanelState`'s dependency array included the run's elapsed, which
 * ticks every 100ms, so it re-mapped the whole run log and every node timing ten times a second for
 * the length of a run.
 *
 * Both projections build a fresh object when they recompute, so the number of distinct identities
 * the panel published is the number of times each of them ran. The clock is injected, so the tick
 * has something new to report without this file asserting anything about wall-clock time.
 */
describe('the 100ms clock, and what it is allowed to reach', () => {
  it('invalidates neither the run log nor any node timing, in the composed Studio', async () => {
    await inFrame(async (world) => {
      await mounted(world.model)
      await started(world)
      world.stream.push(RUN_STARTED)
      world.stream.push({
        type: 'node-log',
        line: { nodeId: 'n0', message: 'layout pass complete', at: 0 },
      } as RunStreamEvent)
      world.stream.push(status('n0', 'running'))
      await flush()

      // Subscribed, because these caches are the connected graph's — and because `run.elapsedMs`'s
      // own connect hook is what starts the 100ms loop at all.
      const published: RunPanelState[] = []
      const stopPanel = world.model.runPanel.state.subscribe((value) => {
        if (value !== undefined) published.push(value)
      })
      const overlays: Record<string, number> = {}
      const stopOverlays = CHAIN.map((nodeId) => {
        overlays[nodeId] = 0
        return world.model.canvas.nodeOverlay(nodeId).subscribe(() => {
          overlays[nodeId] = (overlays[nodeId] ?? 0) + 1
        })
      })
      const metas: unknown[] = []
      const stopMeta = world.model.runPanel.meta.subscribe((value) => metas.push(value))
      await flush()
      published.length = 0
      for (const nodeId of CHAIN) overlays[nodeId] = 0
      metas.length = 0

      const before = runningOf(world.model.runPanel.state())

      // Two ticks, each waited for by count rather than by clock. The injected `now` is what the
      // ticker reads, so moving it is what gives the loop something new to publish.
      world.clock.value = 2_200
      await wrap(untilAtLeast(() => published.length, 1, 'the first tick to reach the panel'))
      world.clock.value = 3_400
      await wrap(untilAtLeast(() => published.length, 2, 'the second tick to reach the panel'))
      const after = runningOf(world.model.runPanel.state())

      // Guards against passing vacuously: the clock really advanced and the panel really reprinted
      // it, twice.
      expect(before.elapsed).toBe('0.0s')
      expect(after.elapsed).toBe('2.4s')
      expect(published.length).toBeGreaterThan(1)

      // The two projections the tick must not reach, counted as recomputations: each builds a fresh
      // object when it runs, so one distinct identity across every state the panel published is one
      // computation for the whole stretch.
      expect(new Set(published.map((state) => runningOf(state).log)).size).toBe(1)
      expect(new Set(published.map((state) => runningOf(state).nodes)).size).toBe(1)
      expect(after.log).toBe(before.log)
      expect(after.nodes).toBe(before.nodes)

      // The canvas carries a node timing too — a settled card prints its own elapsed — and the tick
      // reaches no card either. `n0` is `running`, which is the overlay that reads the run's
      // progress, and a clock that moves no node does not move that number.
      expect(overlays).toEqual({ n0: 0, n1: 0, n2: 0, n3: 0, n4: 0, n5: 0 })

      // The dock header does not carry the clock while a run is in flight: it published `#300` once
      // and nothing since.
      expect(metas).toEqual([])
      expect(world.model.runPanel.meta()).toEqual({ text: '#300', tone: 'normal' })

      stopMeta()
      stopPanel()
      for (const unsubscribe of stopOverlays) unsubscribe()
      world.stream.end()
      await wrap(until(() => !world.model.run.running(), 'the run to end'))
    })
  })
})

/**
 * Claim (c). Perf problem #3: `FlowCanvas` syncs its internal React Flow state from the **identity**
 * of the `nodes` and `edges` props, and the hook rebuilt `nodes` whenever the overlays were rebuilt
 * — every stream frame — so a drag begun while a run streamed reset under the pointer.
 */
describe('the node array a drag is holding', () => {
  it('is invalidated zero times across a whole run of the composed Studio', async () => {
    await inFrame(async (world) => {
      await mounted(world.model)

      let nodeArrays = 0
      let edgeArrays = 0
      const stop = [
        world.model.canvas.nodes.subscribe(() => {
          nodeArrays += 1
        }),
        world.model.canvas.edges.subscribe(() => {
          edgeArrays += 1
        }),
      ]
      await flush()
      const first = world.model.canvas.nodes()
      const firstEdges = world.model.canvas.edges()
      expect(first).toHaveLength(CHAIN.length)
      expect([nodeArrays, edgeArrays]).toEqual([1, 1])

      await started(world)
      world.stream.push(RUN_STARTED)
      for (const nodeId of CHAIN) {
        world.stream.push(status(nodeId, 'running'))
        world.stream.push({
          type: 'node-log',
          line: { nodeId, message: 'working', at: 1_010 },
        } as RunStreamEvent)
        world.stream.push(status(nodeId, 'ok'))
        await flush()
      }
      world.stream.push({ type: 'run-settled', report: chainReport(CHAIN) } as RunStreamEvent)
      world.stream.end()
      await wrap(until(() => !world.model.run.running(), 'the run to settle'))
      await flush()

      // The overlays did move — this is a real run, not a still one.
      expect(world.model.canvas.nodeOverlay('n3')()?.state).toBe('ok')
      expect(world.model.runPanel.state()?.kind).toBe('completed')

      // One extra notification here is an in-flight drag reset under the pointer.
      expect([nodeArrays, edgeArrays]).toEqual([1, 1])
      expect(world.model.canvas.nodes()).toBe(first)
      expect(world.model.canvas.edges()).toBe(firstEdges)

      for (const unsubscribe of stop) unsubscribe()
    })
  })
})

/**
 * Perf problem #4, stated as an O(1) claim rather than as a magic number.
 *
 * `overlays` did `report.nodes.find(…)` and `descriptor.nodes.find(…)` **per node, per frame** — two
 * O(n²) scans. Both lists are indexed into a `Map` once now, so the number of times the settle
 * reads either list is a constant, and comparing a two-node flow against a six-node one is what says
 * so without this file pinning a number that a refactor would have to keep in step.
 *
 * The counters are reset immediately before the terminal line is pushed, so what is measured is the
 * settle alone — every load-time and per-node-event read has already happened and is not the subject.
 */
describe('the two indexes behind the overlays', () => {
  async function readsDuringSettle(
    ids: readonly string[],
  ): Promise<{ descriptor: number; report: number }> {
    let descriptorReads = 0
    let reportReads = 0

    const builtDescriptor = chainDescriptor(ids)
    const descriptorNodes = builtDescriptor.nodes
    const descriptor = { ...builtDescriptor }
    Object.defineProperty(descriptor, 'nodes', {
      enumerable: true,
      get: () => {
        descriptorReads += 1
        return descriptorNodes
      },
    })

    const builtReport = chainReport(ids)
    const reportNodes = builtReport.nodes
    const report = { ...builtReport }
    Object.defineProperty(report, 'nodes', {
      enumerable: true,
      get: () => {
        reportReads += 1
        return reportNodes
      },
    })

    await inFrame(
      async (world) => {
        await mounted(world.model)
        await started(world)
        world.stream.push({ ...RUN_STARTED, nodeCount: ids.length } as RunStreamEvent)
        for (const nodeId of ids) {
          world.stream.push(status(nodeId, 'ok'))
          await flush()
        }
        // Everything a card can read before the report lands has been read; from here on, only the
        // settle is being counted.
        descriptorReads = 0
        reportReads = 0
        world.stream.push({ type: 'run-settled', report } as unknown as RunStreamEvent)
        world.stream.end()
        await wrap(until(() => !world.model.run.running(), 'the run to settle'))
        await flush()

        // The settled cards really were derived — an uncounted settle would pass vacuously.
        for (const nodeId of ids) {
          expect(world.model.canvas.nodeOverlay(nodeId)()?.state).toBe('ok')
        }
      },
      {
        client: (stream) =>
          stubClient({
            listFlows: async () => [{ id: 'chain', name: 'chain', nodeCount: ids.length }],
            loadFlow: async () => ({
              descriptor: descriptor as SafeFlowDescriptorPayload,
              document: chainDocument(ids),
              revision: 'rev-1',
            }),
            startRun: async () => stream.open(),
          }),
      },
    )

    return { descriptor: descriptorReads, report: reportReads }
  }

  it('reads each list the same number of times for two nodes and for six', async () => {
    const small = await readsDuringSettle(['n0', 'n1'])
    const large = await readsDuringSettle(CHAIN)

    // Both lists really were read, so the equality below is not two zeroes agreeing.
    expect(small.descriptor).toBeGreaterThan(0)
    expect(small.report).toBeGreaterThan(0)
    expect(large).toEqual(small)
  })
})
