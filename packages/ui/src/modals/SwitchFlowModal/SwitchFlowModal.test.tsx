import type { FlowDocument } from '@jobik/core'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JobikClient, SafeFlowDescriptorPayload } from '#client/index.js'
import type { StudioDeps, StudioModel } from '#model/index.js'
import { reatomStudio, StudioModelProvider } from '#model/index.js'
import type { NodeRunRecord, RunSession } from '#studio/runSession.js'
import {
  SwitchFlowModal,
  switchFlowRunningMessage,
  switchFlowRunningMeta,
  switchFlowUnsavedMessage,
  switchFlowUnsavedMeta,
} from './SwitchFlowModal.js'

/**
 * The dialog reads `FlowSwitchModel` and takes no props, so every case drives one — a real
 * `reatomStudio` in a `StudioModelProvider`, put into the state `3F` draws each of its two bodies
 * from, and then asked for the switch the way a sidebar row asks: `flowSwitch.requestFlow`.
 *
 * **The flow is loaded rather than faked in.** `flows.descriptor` names the flow being left and
 * carries the `documentFile` the unsaved sentence prints, and it is `loaded.data()` narrowed — so
 * the stub client answers `loadFlow` and {@link mount} waits for it. Writing `loaded.data` by hand
 * instead is worse than it looks: `descriptor` connects the async computed behind it, so a manual
 * write and the load it kicks off fight each other.
 *
 * **{@link mount} subscribes to `flows.descriptor` itself**, which a mounted Studio does through
 * `StudioApp` and this dialog deliberately does not: a shut `SwitchFlowModal` reads `body` and
 * nothing else — that is the whole point of moving the guard into it — so without that subscription
 * nothing here would ever load a flow.
 *
 * `now` is fixed for the reason `CancelRunModal.test.tsx` fixes it: the run body prints
 * `elapsedMs`, so the 100 Hz ticker the component connects by reading it recomputes the same
 * number and never re-renders anything.
 */

const NOW = 1_700_000_000_000

/** `1.3s`, the artboard's own read-out: `formatElapsed` rounds 1349ms to one decimal. */
const ELAPSED_MS = 1_349

const DOCUMENT = {
  format: 'jobik.flow',
  version: 1,
  connections: [],
  literals: {},
  layout: { start1: { x: 0, y: 0 }, render: { x: 300, y: 0 } },
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
      input: { nodeId: 'start1', fields: [] },
      output: { nodeId: 'start1', fields: [] },
    },
  ],
} as unknown as SafeFlowDescriptorPayload

/** Discovery seeds `flowId` from the first entry, so `publication` is the flow being left. */
const FLOWS = [
  { id: 'publication', name: 'publication', nodeCount: 2 },
  { id: 'digest', name: 'digest', nodeCount: 2 },
  { id: 'forecast', name: 'forecast', nodeCount: 2 },
]

function stubClient(overrides: Partial<JobikClient> = {}): JobikClient {
  return {
    listFlows: vi.fn(async () => FLOWS),
    loadFlow: vi.fn(async () => ({
      descriptor: DESCRIPTOR,
      document: DOCUMENT,
      revision: 'rev-1',
    })),
    validate: vi.fn(async () => ({ valid: true })),
    save: vi.fn<JobikClient['save']>(async () => ({ revision: 'rev-2' })),
    startRun: vi.fn(),
    cancelRun: vi.fn<JobikClient['cancelRun']>(async () => true),
    assetUrl: vi.fn(() => '/api/assets/x'),
    extensionBundleUrl: vi.fn(() => '/api/flows/x/ui.js'),
    ...overrides,
  } as unknown as JobikClient
}

/** A live run: `start1` settled, `render` still working — which is what the run body names. */
function liveSession(overrides: Partial<RunSession> = {}): RunSession {
  return {
    startId: 'start1',
    runToken: 'tok-9',
    runNumber: 221,
    nodeCount: 2,
    startedAt: NOW - ELAPSED_MS,
    nodes: new Map<string, NodeRunRecord>([
      ['start1', { status: 'ok', elapsedMs: 10, error: null }],
      ['render', { status: 'running', elapsedMs: 0, error: null }],
    ]),
    logs: [],
    report: undefined,
    failure: undefined,
    cancelling: false,
    ...overrides,
  }
}

const connected: (() => void)[] = []

afterEach(() => {
  for (const off of connected.splice(0)) off()
  cleanup()
})

interface World {
  readonly model: StudioModel
}

async function mount(client: JobikClient = stubClient()): Promise<World> {
  const deps: StudioDeps = { client, now: () => NOW }
  const model = reatomStudio(deps)
  connected.push(model.flows.descriptor.subscribe(() => {}))

  render(
    <StudioModelProvider model={model}>
      <SwitchFlowModal />
    </StudioModelProvider>,
  )
  await waitFor(() => {
    expect(model.flows.descriptor()).toBeDefined()
  })
  return { model }
}

/**
 * The unsaved body: a draft that has moved away from disk, then the switch. `unsavedChanges` counts
 * moved nodes, so `moved` decides the `4 unsaved changes` read-out exactly.
 */
async function mountUnsaved(
  options: { client?: JobikClient; moved?: number; target?: string } = {},
): Promise<World> {
  const world = await mount(options.client ?? stubClient())
  await act(async () => {
    for (let index = 0; index < (options.moved ?? 4); index++) {
      world.model.draft.moveNode({ nodeId: `moved${index}`, position: { x: index + 1, y: 0 } })
    }
    world.model.flowSwitch.requestFlow(options.target ?? 'digest')
  })
  await screen.findByTestId('switch-flow-modal')
  return world
}

/** The run body. `3F` gives a run in flight precedence, so no draft is needed for it. */
async function mountRunning(
  options: { client?: JobikClient; session?: RunSession; target?: string } = {},
): Promise<World> {
  const world = await mount(options.client ?? stubClient())
  const session = options.session ?? liveSession()
  await act(async () => {
    world.model.run.session.set(session)
    world.model.run.runToken.set(session.runToken)
    world.model.run.startedAt.set(NOW - ELAPSED_MS)
    world.model.run.running.set(true)
    world.model.flowSwitch.requestFlow(options.target ?? 'digest')
  })
  await screen.findByTestId('switch-flow-modal')
  return world
}

describe('switchFlowUnsavedMessage', () => {
  it('sets the flow, its document file and the target in mono, in that order', () => {
    const segments = switchFlowUnsavedMessage({
      currentFlowName: 'publication',
      documentFile: 'flow.jobik.json',
      targetFlowName: 'digest',
    })

    expect(segments.filter((segment) => segment.mono === true).map((s) => s.text)).toEqual([
      'publication',
      'flow.jobik.json',
      'digest',
    ])
    expect(segments.map((segment) => segment.text).join('')).toBe(
      'publication has edits that are not in flow.jobik.json yet. Opening digest closes the draft, and a discarded draft cannot be recovered.',
    )
  })
})

describe('switchFlowRunningMessage', () => {
  it('sets the working node, the flow being left and the run number in mono', () => {
    const segments = switchFlowRunningMessage({
      nodeId: 'render',
      currentFlowName: 'publication',
      runNumber: 221,
    })

    expect(segments.filter((segment) => segment.mono === true).map((s) => s.text)).toEqual([
      'render',
      'publication',
      '#221',
    ])
    expect(segments.map((segment) => segment.text).join('')).toBe(
      'render keeps running on the server once publication closes, and run #221 lands in its history either way. Cancel it here if it should stop.',
    )
  })
})

describe('the two meta read-outs', () => {
  it('counts unsaved changes and says `change` for one of them', () => {
    expect(switchFlowUnsavedMeta(4)).toBe('4 unsaved changes')
    expect(switchFlowUnsavedMeta(1)).toBe('1 unsaved change')
  })

  it('names the run and its elapsed time', () => {
    expect(switchFlowRunningMeta(221, '1.3s')).toBe('run #221 · 1.3s')
  })
})

describe('SwitchFlowModal, both bodies', () => {
  it('titles itself with the flow being opened and names the dialog with it', async () => {
    await mountUnsaved()

    expect(screen.getByRole('heading', { name: 'Switch to digest?' })).toBeInTheDocument()
    expect(screen.getByTestId('switch-flow-modal')).toHaveAttribute(
      'aria-label',
      'Switch to digest?',
    )
  })

  it('interpolates the target rather than hard-coding the artboard value', async () => {
    await mountUnsaved({ target: 'forecast' })

    expect(screen.getByRole('heading', { name: 'Switch to forecast?' })).toBeInTheDocument()
  })

  it('draws no header band and no ×', async () => {
    await mountUnsaved()

    expect(screen.queryByTestId('modal-close')).toBeNull()
    expect(screen.queryByTestId('modal-context')).toBeNull()
  })

  it('spells the third action into the footer hint, naming the flow it stays in', async () => {
    await mountUnsaved()

    expect(screen.getByTestId('modal-hint')).toHaveTextContent('esc stays in publication')
  })

  it('offers two actions and never a third', async () => {
    await mountUnsaved()

    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('is destructive: a backdrop click does not dismiss it', async () => {
    const { model } = await mountUnsaved()

    fireEvent.click(screen.getByTestId('switch-flow-modal'))

    expect(model.flowSwitch.pendingFlowId()).toBe('digest')
    expect(screen.getByTestId('switch-flow-modal')).toBeInTheDocument()
  })

  it('answers esc, which is what the hint promises', async () => {
    const { model } = await mountUnsaved()

    fireEvent.keyDown(screen.getByTestId('switch-flow-modal'), { key: 'Escape' })

    expect(model.flowSwitch.pendingFlowId()).toBeUndefined()
    expect(model.flows.flowId()).toBe('publication')
  })

  /**
   * The guard `StudioApp` used to hold — it wrote
   * `body === undefined || pendingFlowName === undefined ? null : <SwitchFlowModal … />`. It is
   * here now, so the whole Studio body stops depending on `flowSwitch.body`, a computed that reads
   * the run's elapsed time and therefore moves ten times a second for the length of a run.
   *
   * The second half is `3F`'s own rule rather than this component's: a switch that would lose
   * nothing never asks, so `requestFlow` takes it straight through and no dialog is drawn at all.
   */
  it('draws nothing at all with no flow pending, and nothing when nothing is at risk', async () => {
    const { model } = await mount()
    expect(screen.queryByTestId('switch-flow-modal')).toBeNull()

    await act(async () => {
      model.flowSwitch.requestFlow('digest')
    })

    expect(screen.queryByTestId('switch-flow-modal')).toBeNull()
    expect(model.flows.flowId()).toBe('digest')
  })
})

describe('SwitchFlowModal — unsaved draft', () => {
  it('marks itself with the top bar’s unsaved dot and nothing that moves', async () => {
    await mountUnsaved()

    expect(screen.getByTestId('switch-flow-dot')).toBeInTheDocument()
    expect(screen.queryByTestId('switch-flow-spinner')).toBeNull()
  })

  it('counts the unsaved changes it was given', async () => {
    await mountUnsaved({ moved: 7 })

    expect(screen.getByTestId('switch-flow-meta')).toHaveTextContent('7 unsaved changes')
  })

  it('draws the body sentence over the flow, its file and the target', async () => {
    await mountUnsaved()

    expect(screen.getByTestId('switch-flow-message')).toHaveTextContent(
      'publication has edits that are not in flow.jobik.json yet. Opening digest closes the draft, and a discarded draft cannot be recovered.',
    )
  })

  /**
   * The two answers, asserted on the model rather than on a callback spy, and mounted separately
   * because the first press closes the dialog and takes the second button with it.
   *
   * `Discard changes` is `switchToPending`: the flow moves at once and nothing is written. `Save
   * and switch` is `saveAndSwitch`, which sends the draft — `client.save` is called synchronously,
   * before the action suspends — and switches only once that write has landed, which is why the
   * flow id has not moved on the line after the press and has by the time the promise settles.
   */
  it('runs the ghost that sacrifices the draft and the primary that keeps it', async () => {
    const discardClient = stubClient()
    const discarded = await mountUnsaved({ client: discardClient })
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(discarded.model.flows.flowId()).toBe('digest')
    expect(discarded.model.flowSwitch.pendingFlowId()).toBeUndefined()
    expect(discardClient.save).not.toHaveBeenCalled()

    cleanup()

    const save = vi.fn<JobikClient['save']>(async () => ({ revision: 'rev-2' }))
    const saved = await mountUnsaved({ client: stubClient({ save }) })
    fireEvent.click(screen.getByRole('button', { name: 'Save and switch' }))
    expect(save).toHaveBeenCalledTimes(1)
    expect(saved.model.flows.flowId()).toBe('publication')

    await waitFor(() => {
      expect(saved.model.flows.flowId()).toBe('digest')
    })
  })
})

describe('SwitchFlowModal — run in progress', () => {
  it('keeps the spinner turning, because the run has not stopped', async () => {
    await mountRunning()

    expect(screen.getByTestId('switch-flow-spinner')).toBeInTheDocument()
    expect(screen.queryByTestId('switch-flow-dot')).toBeNull()
  })

  it('names the run and its elapsed time', async () => {
    await mountRunning()

    expect(screen.getByTestId('switch-flow-meta')).toHaveTextContent('run #221 · 1.3s')
  })

  it('draws the body sentence over the node still working', async () => {
    await mountRunning({
      session: liveSession({
        nodes: new Map<string, NodeRunRecord>([
          ['start1', { status: 'ok', elapsedMs: 10, error: null }],
          ['publish', { status: 'running', elapsedMs: 0, error: null }],
        ]),
      }),
    })

    expect(screen.getByTestId('switch-flow-message')).toHaveTextContent(
      'publish keeps running on the server once publication closes, and run #221 lands in its history either way. Cancel it here if it should stop.',
    )
  })

  /**
   * `3F` rule 02, on the model. `Cancel and switch` sends the run's own token *and* switches — the
   * order inside `cancelAndSwitch` is load-bearing, because `switchTo` clears the token the cancel
   * is aimed at. `Switch and keep running` reaches no server at all.
   */
  it('runs the ghost that sacrifices the run and the primary that keeps it', async () => {
    const cancelRun = vi.fn<JobikClient['cancelRun']>(async () => true)

    const cancelled = await mountRunning({ client: stubClient({ cancelRun }) })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel and switch' }))
    expect(cancelRun).toHaveBeenCalledWith('tok-9')
    expect(cancelled.model.flows.flowId()).toBe('digest')

    cleanup()

    const kept = await mountRunning({ client: stubClient({ cancelRun }) })
    fireEvent.click(screen.getByRole('button', { name: 'Switch and keep running' }))
    expect(cancelRun).toHaveBeenCalledTimes(1)
    expect(kept.model.flows.flowId()).toBe('digest')
  })
})

/**
 * F-M10 — `4A`: *"Switch-flow modal — 200 / 120 ms, and the 240 ms screen change starts only after
 * it closes."*
 *
 * The two cases below are the two runtimes this has to be right in, and they are different
 * runtimes rather than two spellings of one:
 *
 *  * **jsdom applies no stylesheet, so the card's `animation-duration` computes to zero** — the
 *    same value `prefers-reduced-motion` produces in a browser. `ModalShell` measures it and calls
 *    `onExited` in the same effect, so the switch lands inside the press with nothing deferred and
 *    nothing to deadlock on. Every other case in this file already depends on that, silently; this
 *    one says so.
 *  * **a real browser holds the card for 120 ms**, which is reproduced by reporting a duration and
 *    then firing the `animationend` the card would fire. The flow must not change until then.
 */
describe('4A — the screen change waits for the card to finish leaving', () => {
  it('commits inside the press when the exit is instantaneous', async () => {
    const world = await mountUnsaved()

    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))

    expect(world.model.flows.flowId()).toBe('digest')
    expect(world.model.flowSwitch.closingFlowId()).toBeUndefined()
    expect(screen.queryByTestId('switch-flow-modal')).toBeNull()
  })

  it('holds the flow change until the departure ends when one is actually playing', async () => {
    const world = await mountUnsaved()
    const dialog = screen.getByTestId('switch-flow-modal')
    const card = dialog.firstElementChild as HTMLElement

    // What a browser reports for the leaving card, and what jsdom never will: `ModalShell` reads
    // this off the element rather than assuming a number, so stating it here is the whole stub.
    const computed = globalThis.getComputedStyle.bind(globalThis)
    vi.spyOn(globalThis, 'getComputedStyle').mockImplementation((element, pseudo) =>
      element === card
        ? ({ animationDuration: '120ms' } as CSSStyleDeclaration)
        : computed(element as Element, pseudo),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))

    // The answer is recorded and the dialog is on its way out — and the flow has not moved.
    expect(world.model.flowSwitch.body()).toBeUndefined()
    expect(world.model.flowSwitch.closingFlowId()).toBe('digest')
    expect(world.model.flows.flowId()).toBe('publication')
    expect(screen.getByTestId('switch-flow-modal')).toHaveAttribute('data-phase', 'leaving')

    await act(async () => {
      fireEvent.animationEnd(card)
    })

    expect(world.model.flows.flowId()).toBe('digest')
    expect(world.model.flowSwitch.closingFlowId()).toBeUndefined()
  })
})
