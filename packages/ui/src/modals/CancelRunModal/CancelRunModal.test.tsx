import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JobikClient } from '#client/index.js'
import type { StudioDeps, StudioModel } from '#model/index.js'
import { reatomStudio, StudioModelProvider } from '#model/index.js'
import type { NodeRunRecord, RunSession } from '#studio/runSession.js'
import { CancelRunModal, cancelRunMessage } from './CancelRunModal.js'

afterEach(cleanup)

/**
 * The dialog reads `RunModel`, so every case here drives one — a real `reatomStudio`, in a
 * `StudioModelProvider`, with the run's own atoms written to the state the artboard draws.
 *
 * **Nothing awaits, and that is what keeps this simple.** The model's units are written before the
 * first render, so no read in this file ever crosses an `await` and none of the frame-losing
 * hazards that make the model suites use `await wrap(…)` can arise. `now` is fixed, which matters
 * for a second reason: `elapsedMs` is `now() - startedAt` while a run is in flight, so the 100ms
 * ticker the component connects by reading it recomputes the same number every time and never
 * re-renders anything.
 */

const NOW = 1_700_000_000_000

/** `1.3s`, the artboard's own read-out: `formatElapsed` rounds 1349ms to one decimal. */
const ELAPSED_MS = 1_349

function stubClient(overrides: Partial<JobikClient> = {}): JobikClient {
  return {
    listFlows: vi.fn(),
    loadFlow: vi.fn(),
    validate: vi.fn(),
    save: vi.fn(),
    startRun: vi.fn(),
    cancelRun: vi.fn<JobikClient['cancelRun']>(async () => true),
    assetUrl: vi.fn(() => '/api/assets/x'),
    extensionBundleUrl: vi.fn(() => '/api/flows/x/ui.js'),
    ...overrides,
  } as unknown as JobikClient
}

/** A live run: `start1` settled, `render` still working — which is what the dialog names twice. */
function liveSession(overrides: Partial<RunSession> = {}): RunSession {
  return {
    startId: 'start1',
    runToken: 'tok-9',
    runNumber: 219,
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

/**
 * A Studio whose run is in flight and whose cancel prompt is up — the only state in which the
 * dialog draws anything at all.
 */
function mount(options: { session?: RunSession; client?: JobikClient } = {}): {
  model: StudioModel
} {
  const deps: StudioDeps = { client: options.client ?? stubClient(), now: () => NOW }
  const model = reatomStudio(deps)

  model.run.session.set(options.session ?? liveSession())
  model.run.runToken.set('tok-9')
  model.run.startedAt.set(NOW - ELAPSED_MS)
  model.run.running.set(true)
  model.run.cancelPrompt.set(true)

  render(
    <StudioModelProvider model={model}>
      <CancelRunModal />
    </StudioModelProvider>,
  )
  return { model }
}

describe('cancelRunMessage', () => {
  it('sets the node identifier in mono at both ends of the sentence', () => {
    const segments = cancelRunMessage('render')
    expect(segments.filter((segment) => segment.mono === true)).toHaveLength(2)
    expect(segments.map((segment) => segment.text).join('')).toBe(
      'render is asked to stop and the run settles at once, without waiting for it. Nothing is kept, so a re-run starts from the beginning and executes render again.',
    )
  })
})

describe('CancelRunModal', () => {
  it('titles itself with the run number and names the dialog with it', () => {
    mount()
    expect(screen.getByRole('heading', { name: 'Cancel run #219?' })).toBeInTheDocument()
    expect(screen.getByTestId('cancel-run-modal')).toHaveAttribute('aria-label', 'Cancel run #219?')
  })

  it('interpolates the run number rather than hard-coding the artboard value', () => {
    mount({ session: liveSession({ runNumber: 221 }) })
    expect(screen.getByRole('heading', { name: 'Cancel run #221?' })).toBeInTheDocument()
  })

  it('draws no header band and no ×', () => {
    mount()
    expect(screen.queryByTestId('modal-close')).toBeNull()
    expect(screen.queryByTestId('modal-context')).toBeNull()
  })

  it('keeps the spinner turning and prints the elapsed time', () => {
    mount()
    expect(screen.getByTestId('cancel-run-spinner')).toBeInTheDocument()
    expect(screen.getByTestId('cancel-run-elapsed')).toHaveTextContent('1.3s')
  })

  it('draws the body sentence with the node it was given', () => {
    mount({
      session: liveSession({
        nodes: new Map<string, NodeRunRecord>([
          ['start1', { status: 'ok', elapsedMs: 10, error: null }],
          ['publish', { status: 'running', elapsedMs: 0, error: null }],
        ]),
      }),
    })
    expect(screen.getByTestId('cancel-run-message')).toHaveTextContent(
      'publish is asked to stop and the run settles at once, without waiting for it. Nothing is kept, so a re-run starts from the beginning and executes publish again.',
    )
  })

  it('draws the inverted esc hint verbatim', () => {
    mount()
    expect(screen.getByTestId('modal-hint')).toHaveTextContent('esc keeps running')
  })

  /**
   * The two answers, each asserted on the model rather than on a callback spy: `Keep running` is
   * `RunModel.keepRunning`, which closes the prompt and reaches no server, and `Cancel run` is
   * `confirmCancel`, which closes it and sends the run's own token. They are mounted separately
   * because the first press closes the dialog and takes the second button with it.
   */
  it('runs both footer actions', () => {
    const cancelRun = vi.fn<JobikClient['cancelRun']>(async () => true)

    const kept = mount({ client: stubClient({ cancelRun }) })
    fireEvent.click(screen.getByRole('button', { name: 'Keep running' }))
    expect(kept.model.run.cancelPrompt()).toBe(false)
    expect(cancelRun).not.toHaveBeenCalled()

    cleanup()

    const cancelled = mount({ client: stubClient({ cancelRun }) })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel run' }))
    expect(cancelled.model.run.cancelPrompt()).toBe(false)
    expect(cancelRun).toHaveBeenCalledWith('tok-9')
  })

  it('rule 02 — the destructive dialog ignores a backdrop click', () => {
    const { model } = mount()
    fireEvent.click(screen.getByTestId('cancel-run-modal'))
    expect(model.run.cancelPrompt()).toBe(true)
    expect(screen.getByTestId('cancel-run-modal')).toBeInTheDocument()
  })

  it('still answers esc, which is what `esc keeps running` promises', () => {
    const { model } = mount()
    fireEvent.keyDown(screen.getByTestId('cancel-run-modal'), { key: 'Escape' })
    expect(model.run.cancelPrompt()).toBe(false)
  })

  /**
   * The guard the caller used to hold. `StudioApp` wrote
   * `cancelPrompt && running && session !== undefined ?  … : null`; it is here now, so a closed
   * dialog subscribes to `cancelPrompt` and never reads the session the stream rewrites on every
   * line.
   */
  it('draws nothing at all until the prompt is up, and nothing once the run has settled', () => {
    const deps: StudioDeps = { client: stubClient(), now: () => NOW }
    const model = reatomStudio(deps)
    model.run.session.set(liveSession())
    model.run.running.set(true)

    render(
      <StudioModelProvider model={model}>
        <CancelRunModal />
      </StudioModelProvider>,
    )
    expect(screen.queryByTestId('cancel-run-modal')).toBeNull()

    cleanup()

    const settled = reatomStudio(deps)
    settled.run.session.set(liveSession())
    settled.run.cancelPrompt.set(true)

    render(
      <StudioModelProvider model={settled}>
        <CancelRunModal />
      </StudioModelProvider>,
    )
    expect(screen.queryByTestId('cancel-run-modal')).toBeNull()
  })
})
