import { type Atom, action, atom, computed, context, withAsync, wrap } from '@reatom/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobikClient, SafeFlowDescriptorPayload, WireRunReportPayload } from '#client/index.js'
import { ACTION_TIMINGS, type CopyState } from '#primitives/index.js'
import type { RunSession } from '#studio/runSession.js'
import { type OutputActionsModel, reatomOutput } from './output.js'
import type { OutputModel, RunModel, StudioDeps } from './types.js'

/**
 * The model's own tests for the output viewer, the `2A` dock strings and `3A`'s two sequences.
 *
 * The first three cases were `StudioApp.test.tsx` cases and keep their names; the copy and download
 * cases keep the names `primitives/actionState.test.ts` gave the same transitions, because that is
 * what this model now performs. Neither of those files is touched — `StudioApp` still drives the
 * hooks until the waves that rewrite them.
 *
 * **Every promise this file awaits is a `wrap`ped one.** `context.start(async …)` holds its frame
 * only across wrapped boundaries; resuming from a bare `await` puts the reads that follow in the
 * DEFAULT context, where these atoms have never been written (RTM-A04).
 */

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
      input: { nodeId: 'start1', fields: [] },
      output: {
        nodeId: 'start1',
        fields: [{ field: 'title', required: true, annotation: 'string' }],
      },
    },
    {
      id: 'render',
      kind: 'transform' as const,
      title: 'imageOut',
      input: { nodeId: 'render', fields: [] },
      output: {
        nodeId: 'render',
        fields: [
          { field: 'image', required: true, annotation: 'Buffer', asset: { mime: 'image/png' } },
        ],
      },
    },
  ],
} as unknown as SafeFlowDescriptorPayload

const REPORT: WireRunReportPayload = {
  flowName: 'publication',
  startId: 'start1',
  runNumber: 219,
  status: 'ok',
  elapsedMs: 2400,
  nodes: [
    {
      nodeId: 'start1',
      status: 'ok',
      elapsedMs: 10,
      output: { title: 't' },
      assets: {},
      error: null,
    },
    {
      nodeId: 'render',
      status: 'ok',
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
}

/** The settled session every read-only surface projects, with the run's own start at `0`. */
function sessionOf(report: WireRunReportPayload): RunSession {
  return {
    startId: report.startId,
    runToken: 'tok',
    runNumber: report.runNumber,
    nodeCount: report.nodes.length,
    startedAt: 0,
    nodes: new Map(),
    logs: report.logs,
    report,
    failure: undefined,
    cancelling: false,
  }
}

interface World {
  readonly output: OutputModel & OutputActionsModel
  readonly viewedSession: Atom<RunSession | undefined>
  /** `InputsModel.startId`'s stand-in — the start the run panel is pointed at. */
  readonly startId: Atom<string | undefined>
  /** `RunModel.start`'s stand-in: this module observes the press, never the run behind it. */
  readonly start: RunModel['start']
  /** Every state this run of the test saw the copy button in, in order. */
  readonly copyCells: readonly CopyState[]
  /**
   * Lets a settled promise reach the model. The returned promise is `wrap`ped, and that is the
   * load-bearing part: `await settle()` is an ordinary `await`, and without the wrap the reads after
   * it would run in the default context and see nothing.
   */
  readonly settle: () => Promise<void>
  /** Advances the fake clock, keeping the frame the same way {@link World.settle} does. */
  readonly elapse: (ms: number) => Promise<unknown>
  readonly disconnect: () => void
}

function createWorld(): World {
  const deps = { client: {} as unknown as JobikClient } satisfies StudioDeps

  const descriptor = atom<SafeFlowDescriptorPayload | undefined>(DESCRIPTOR, 'test.descriptor')
  const startId = atom<string | undefined>('start1', 'test.startId')
  const viewedSession = atom<RunSession | undefined>(sessionOf(REPORT), 'test.viewedSession')
  const viewedReport = computed(() => viewedSession()?.report, 'test.viewedReport')
  const start = action(async (_values: Record<string, unknown>) => {}, 'test.start').extend(
    withAsync(),
  )

  const output = reatomOutput(
    deps,
    { descriptor, startId, viewedSession, viewedReport, start },
    'studio.output',
  )

  const copyCells: CopyState[] = []

  // What `@reatom/react` does for the real Studio: the surfaces read these, which connects
  // everything derived behind them.
  const unsubscribes = [
    output.viewerNodeId.subscribe(() => {}),
    output.openViewerNode.subscribe(() => {}),
    output.dockStrings.subscribe(() => {}),
    output.logs.subscribe(() => {}),
    output.copyState.subscribe((cell) => copyCells.push(cell)),
    output.downloadState.subscribe(() => {}),
  ]

  return {
    output,
    viewedSession,
    startId,
    start,
    copyCells,
    settle: () =>
      wrap(
        (async () => {
          for (let hop = 0; hop < 4; hop += 1) await vi.advanceTimersByTimeAsync(0)
        })(),
      ),
    elapse: (ms: number) => wrap(vi.advanceTimersByTimeAsync(ms)),
    disconnect: () => {
      for (const unsubscribe of unsubscribes) unsubscribe()
    },
  }
}

async function withOutput(body: (world: World) => Promise<void>): Promise<void> {
  await context.start(async () => {
    const world = createWorld()
    try {
      await wrap(body(world))
    } finally {
      world.disconnect()
    }
  })
}

/** jsdom ships no clipboard, so every copy case states the one it wants. */
function stubClipboard(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
}

/** jsdom ships no `URL.createObjectURL` either, which is why the download case stubs both halves. */
function stubObjectUrls(url: string): {
  readonly createObjectURL: ReturnType<typeof vi.fn>
  readonly revokeObjectURL: ReturnType<typeof vi.fn>
} {
  const createObjectURL = vi.fn((_blob: Blob) => url)
  const revokeObjectURL = vi.fn((_url: string) => {})
  globalThis.URL.createObjectURL = createObjectURL as typeof globalThis.URL.createObjectURL
  globalThis.URL.revokeObjectURL = revokeObjectURL as typeof globalThis.URL.revokeObjectURL
  return { createObjectURL, revokeObjectURL }
}

const originalCreateObjectURL = globalThis.URL.createObjectURL
const originalRevokeObjectURL = globalThis.URL.revokeObjectURL

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  globalThis.URL.createObjectURL = originalCreateObjectURL
  globalThis.URL.revokeObjectURL = originalRevokeObjectURL
  Reflect.deleteProperty(globalThis.navigator, 'clipboard')
})

describe('the output viewer', () => {
  it('wires Copy all to the clipboard, not to closing', async () => {
    await withOutput(async ({ output, settle }) => {
      const writeText = vi.fn(async (_text: string) => {})
      stubClipboard(writeText)

      output.open('render')
      output.copyAll()
      await settle()

      expect(writeText).toHaveBeenCalledTimes(1)
      expect(writeText.mock.calls[0]?.[0]).toContain('"runNumber": 219')
      expect(output.viewerNodeId()).toBe('render')
    })
  })

  it('wires Download to a real download, not to closing', async () => {
    await withOutput(async ({ output, settle }) => {
      const { createObjectURL, revokeObjectURL } = stubObjectUrls('blob:mock-download-url')

      output.open('render')
      output.download()
      await settle()

      expect(createObjectURL).toHaveBeenCalledTimes(1)
      const blob = createObjectURL.mock.calls[0]?.[0] as Blob
      expect(blob.type).toBe('application/json')
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-download-url')
      expect(output.viewerNodeId()).toBe('render')
    })
  })

  /**
   * R37, from the model's side: the viewer is opened by node id, taken from the card that was
   * pressed, so a field name shared across two nodes can never mis-route it.
   */
  it('opens the right node when an asset field name collides with another node’s output field', async () => {
    await withOutput(async ({ output, viewedSession }) => {
      viewedSession.set(
        sessionOf({
          ...REPORT,
          nodes: [
            ...REPORT.nodes,
            {
              nodeId: 'publish',
              status: 'ok',
              elapsedMs: 50,
              // Also named `image`, but a plain string output — never an asset.
              output: { image: 'not a binary field, just a string that happens to share the name' },
              assets: {},
              error: null,
            },
          ],
        }),
      )

      output.open('render')

      expect(output.openViewerNode()?.nodeId).toBe('render')
      expect(output.openViewerNode()?.assets.image?.id).toBe('asset-1')
      expect(JSON.stringify(output.openViewerNode()?.output)).not.toContain('not a binary field')
    })
  })

  /**
   * The `Output viewer` artboard draws `Copy all` / `Download` and no close control of its own, so
   * `esc` is what dismisses it. The keypress itself belongs to `ShortcutsModel`; this is the
   * transition it calls.
   */
  it('closes on close(), the artboard drawing no close control of its own', async () => {
    await withOutput(async ({ output }) => {
      output.open('render')
      expect(output.openViewerNode()?.nodeId).toBe('render')

      output.close()

      expect(output.viewerNodeId()).toBeUndefined()
      expect(output.openViewerNode()).toBeUndefined()
      expect(output.dockStrings()).toBeUndefined()
    })
  })
})

/**
 * The open output belongs to the run that produced it, and to the start that run was of.
 * `RunModel.selectRun` makes one write and deliberately leaves this side alone; `RunModel.start` and
 * `InputsModel.startId` are inputs for exactly this reason.
 */
describe('the run the open output belongs to', () => {
  it('closes the viewer when a run begins', async () => {
    await withOutput(async ({ output, start, settle }) => {
      output.open('render')
      expect(output.viewerNodeId()).toBe('render')

      void start({ title: 'A post' })
      await settle()

      expect(output.viewerNodeId()).toBeUndefined()
    })
  })

  it('does not silently reopen when the next report carries a node with the same id', async () => {
    await withOutput(async ({ output, start, viewedSession, settle }) => {
      output.open('render')

      void start({ title: 'A post' })
      await settle()
      // The next run settles with a report of its own that also contains `render`.
      viewedSession.set(sessionOf({ ...REPORT, runNumber: 220 }))

      expect(output.viewerNodeId()).toBeUndefined()
      expect(output.openViewerNode()).toBeUndefined()

      // Still openable: the close is a transition, not a lock.
      output.open('render')
      expect(output.openViewerNode()?.nodeId).toBe('render')
    })
  })

  /**
   * `StudioApp.selectStart` closed the viewer by hand and nothing in the model layer could:
   * `InputsModel` knows nothing about a viewer and this module knew nothing about a start. So
   * `startId` is an input, for the same reason `start` is — an open output is a statement about a
   * run of the start that was selected when it was opened.
   */
  it('closes the viewer when the panel is pointed at another start', async () => {
    await withOutput(async ({ output, startId }) => {
      output.open('render')

      startId.set('start2')

      expect(output.viewerNodeId()).toBeUndefined()
      expect(output.openViewerNode()).toBeUndefined()
    })
  })

  it('leaves the viewer alone when the start it is pointed at does not move', async () => {
    await withOutput(async ({ output, startId }) => {
      output.open('render')

      // F10: the reload that answers a revision conflict keeps the selection, so this write is
      // what a kept selection looks like — the same id, written again.
      startId.set('start1')

      expect(output.viewerNodeId()).toBe('render')
    })
  })

  it('closes the viewer when another run is picked from the history', async () => {
    await withOutput(async ({ output, viewedSession }) => {
      output.open('render')

      viewedSession.set(sessionOf({ ...REPORT, runNumber: 218, elapsedMs: 1100 }))

      expect(output.viewerNodeId()).toBeUndefined()
      expect(output.openViewerNode()).toBeUndefined()
    })
  })

  it('drops the open output on reset, as a flow switch does', async () => {
    await withOutput(async ({ output }) => {
      output.open('render')

      output.reset()

      expect(output.viewerNodeId()).toBeUndefined()
      expect(output.copyState()).toBe('idle')
      expect(output.downloadState()).toBe('idle')
    })
  })
})

describe('`2A` — the dock’s two mono strings', () => {
  it('reads the node, its asset field, that field’s annotation and the run number off the report', async () => {
    await withOutput(async ({ output }) => {
      output.open('render')

      expect(output.dockStrings()).toEqual({
        context: 'render.image · Buffer[1] · run #219',
        summary: 'render.image · 1 file · run #219',
      })
    })
  })

  it('falls to the short form for a node that produced no asset', async () => {
    await withOutput(async ({ output }) => {
      output.open('start1')

      expect(output.dockStrings()).toEqual({
        context: 'start1 · run #219',
        summary: 'start1 · run #219',
      })
    })
  })

  it('has no strings at all while the viewer is closed', async () => {
    await withOutput(async ({ output }) => {
      expect(output.dockStrings()).toBeUndefined()
    })
  })
})

describe('the viewer’s log', () => {
  it('stamps every line with its offset from the run’s own start', async () => {
    await withOutput(async ({ output }) => {
      expect(output.logs()).toEqual([{ time: '0.31', message: 'render layout pass complete' }])
    })
  })

  it('is empty while no run is on screen', async () => {
    await withOutput(async ({ output, viewedSession }) => {
      viewedSession.set(undefined)

      expect(output.logs()).toEqual([])
    })
  })
})

/**
 * `3A` §4.1's copy script, driven through the model rather than through a button. The timings come
 * from `ACTION_TIMINGS`, which the artboard fixes and which nothing here restates.
 */
describe('`3A` — Copy all', () => {
  it('swaps straight to copied, with no spinner, when the write is synchronous', async () => {
    await withOutput(async ({ output, copyCells, settle }) => {
      stubClipboard(async (_text: string) => {})

      output.open('render')
      output.copyAll()
      await settle()

      // Rule 01: clipboard writes are synchronous, so `busy` is never reached — the 400 ms sleep is
      // armed and aborted before it can land. The leading `idle` is the subscription's own first
      // read, not a transition.
      expect(copyCells).toEqual(['idle', 'ok'])
      expect(output.copyState()).toBe('ok')
    })
  })

  it('holds copied for exactly 1.6 s, then returns to idle', async () => {
    await withOutput(async ({ output, settle, elapse }) => {
      stubClipboard(async (_text: string) => {})

      output.open('render')
      output.copyAll()
      await settle()

      await elapse(ACTION_TIMINGS.copiedHoldMs - 1)
      expect(output.copyState()).toBe('ok')

      await elapse(1)
      expect(output.copyState()).toBe('idle')
    })
  })

  it('shows the spinner only once serialising has run past 400 ms', async () => {
    await withOutput(async ({ output, settle, elapse }) => {
      let release: (() => void) | undefined
      const pending = new Promise<void>((resolve) => {
        release = resolve
      })
      stubClipboard(() => pending)

      output.open('render')
      output.copyAll()

      await elapse(ACTION_TIMINGS.copySpinnerDelayMs - 1)
      expect(output.copyState()).toBe('idle')

      await elapse(1)
      expect(output.copyState()).toBe('busy')

      release?.()
      await settle()
      expect(output.copyState()).toBe('ok')
    })
  })

  it('ignores a second press while the first is still holding', async () => {
    await withOutput(async ({ output, settle }) => {
      const writeText = vi.fn(async (_text: string) => {})
      stubClipboard(writeText)

      output.open('render')
      output.copyAll()
      await settle()
      output.copyAll()
      await settle()

      expect(writeText).toHaveBeenCalledTimes(1)
    })
  })

  it('treats a rejected promise as the same failure, for the APIs that only reject', async () => {
    await withOutput(async ({ output, settle, elapse }) => {
      stubClipboard(async (_text: string) => {
        throw new Error('denied')
      })

      output.open('render')
      output.copyAll()
      await settle()
      expect(output.copyState()).toBe('failed')

      // Terminal: `3A` draws no timed exit from the failed cell.
      await elapse(ACTION_TIMINGS.copiedHoldMs * 2)
      expect(output.copyState()).toBe('failed')
    })
  })

  it('retries from failed', async () => {
    await withOutput(async ({ output, settle }) => {
      const writeText = vi
        .fn<(text: string) => Promise<void>>()
        .mockRejectedValueOnce(new Error('blocked'))
        .mockResolvedValue(undefined)
      stubClipboard(writeText)

      output.open('render')
      output.copyAll()
      await settle()
      expect(output.copyState()).toBe('failed')

      output.copyAll()
      await settle()

      expect(writeText).toHaveBeenCalledTimes(2)
      expect(output.copyState()).toBe('ok')
    })
  })

  it('copies nothing at all while no run is on screen', async () => {
    await withOutput(async ({ output, viewedSession, settle }) => {
      const writeText = vi.fn(async (_text: string) => {})
      stubClipboard(writeText)
      viewedSession.set(undefined)

      output.copyAll()
      await settle()

      expect(writeText).not.toHaveBeenCalled()
      expect(output.copyState()).toBe('idle')
    })
  })
})

describe('`3A` — Download', () => {
  it('runs idle -> busy -> ok -> idle', async () => {
    await withOutput(async ({ output, settle, elapse }) => {
      stubObjectUrls('blob:mock-download-url')

      output.open('render')
      output.download()
      // Rule 03's indeterminate branch: nothing on the wire carries a byte count, so `progress` is
      // never reached and `Preparing` is what the press draws.
      expect(output.downloadState()).toBe('busy')

      await settle()
      expect(output.downloadState()).toBe('ok')

      await elapse(ACTION_TIMINGS.savedHoldMs - 1)
      expect(output.downloadState()).toBe('ok')

      await elapse(1)
      expect(output.downloadState()).toBe('idle')
    })
  })

  it('ignores a press while a download is already running', async () => {
    await withOutput(async ({ output, settle }) => {
      const { createObjectURL } = stubObjectUrls('blob:mock-download-url')

      output.open('render')
      output.download()
      output.download()
      await settle()
      output.download()
      await settle()

      expect(createObjectURL).toHaveBeenCalledTimes(1)
    })
  })

  it('names the file after the node it was opened from and the run number', async () => {
    await withOutput(async ({ output, settle }) => {
      stubObjectUrls('blob:mock-download-url')
      const created: HTMLAnchorElement[] = []
      const createElement = globalThis.document.createElement.bind(globalThis.document)
      const spy = vi
        .spyOn(globalThis.document, 'createElement')
        .mockImplementation((tagName: string) => {
          const element = createElement(tagName)
          if (tagName === 'a') created.push(element as HTMLAnchorElement)
          return element
        })

      try {
        output.open('render')
        output.download()
        await settle()
      } finally {
        spy.mockRestore()
      }

      expect(created).toHaveLength(1)
      expect(created[0]?.download).toBe('render-run-219.json')
    })
  })

  it('goes back to idle when the write fails, the only exit a failed download has', async () => {
    await withOutput(async ({ output, settle }) => {
      // No `URL.createObjectURL` at all — jsdom's own state, and the reason `writeDownload`
      // returns its failure rather than throwing it.
      globalThis.URL.createObjectURL = undefined as unknown as typeof globalThis.URL.createObjectURL

      output.open('render')
      output.download()
      await settle()

      expect(output.downloadState()).toBe('idle')
      // The viewer is untouched: a download that could not run is not a reason to dismiss it.
      expect(output.viewerNodeId()).toBe('render')
    })
  })

  it('downloads nothing at all while the viewer is closed', async () => {
    await withOutput(async ({ output, settle }) => {
      const { createObjectURL } = stubObjectUrls('blob:mock-download-url')

      output.download()
      await settle()

      expect(createObjectURL).not.toHaveBeenCalled()
      expect(output.downloadState()).toBe('idle')
    })
  })
})
