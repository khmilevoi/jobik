import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JobikClient, WireRunReportPayload } from '#client/index.js'
import type { StudioDeps } from '#model/index.js'
import { reatomStudio, StudioModelProvider } from '#model/index.js'
import { TOAST_EXIT_MS, TOAST_HOLD_MS } from '#model/toast.js'
import type { RunSession } from '#studio/runSession.js'
import { RunToast } from './RunToast.js'

/**
 * F-C13's surface, over the real model rather than a stub: the toast is only worth having if a
 * settled run actually raises one, so these cases push a session into `RunModel.archive` — the one
 * event `model/toast.ts` reacts to — and read what the shell renders.
 *
 * No case asserts a computed style. `4A`'s durations are in the stylesheet and the token gates
 * cover them; what is behavioural, and what is asserted here, is that the element survives its own
 * exit rather than unmounting the instant it starts to fade.
 */

const REPORT: WireRunReportPayload = {
  flowName: 'publication',
  startId: 'start1',
  runNumber: 219,
  status: 'ok',
  elapsedMs: 2400,
  nodes: [],
  logs: [],
  error: null,
}

function sessionOf(report: WireRunReportPayload): RunSession {
  return {
    startId: report.startId,
    runToken: `tok-${report.runNumber}`,
    runNumber: report.runNumber,
    nodeCount: 0,
    startedAt: 0,
    nodes: new Map(),
    logs: report.logs,
    report,
    failure: undefined,
    cancelling: false,
  }
}

function stubClient(): JobikClient {
  return {
    listFlows: vi.fn(async () => []),
    loadFlow: vi.fn(),
    validate: vi.fn(),
    save: vi.fn(),
    startRun: vi.fn(),
    cancelRun: vi.fn(),
    assetUrl: vi.fn(() => '/api/assets/x'),
    extensionBundleUrl: vi.fn(() => '/api/flows/x/ui.js'),
  } as unknown as JobikClient
}

afterEach(() => {
  // Unmounting is what drops the 2.8s hold: `model/toast.ts` owns it under the connect hook on
  // `message`, so the frame goes with the last reader and no case leaves a timer behind.
  cleanup()
  vi.useRealTimers()
})

function mountToast(): { settle: (report: WireRunReportPayload) => Promise<void> } {
  const deps: StudioDeps = { client: stubClient(), now: () => 1_700_000_000_000 }
  const model = reatomStudio(deps)

  render(
    <StudioModelProvider model={model}>
      <RunToast />
    </StudioModelProvider>,
  )

  return {
    settle: async (report) => {
      await act(async () => {
        model.run.archive.set([sessionOf(report), ...model.run.archive()])
      })
    },
  }
}

describe('RunToast', () => {
  it('draws nothing until a run has settled', () => {
    mountToast()

    expect(screen.queryByTestId('studio-run-toast')).toBeNull()
  })

  it('reports the settled run in the words the report carries', async () => {
    const { settle } = mountToast()
    await settle(REPORT)

    await waitFor(() =>
      expect(screen.getByTestId('studio-run-toast')).toHaveTextContent('Run #219 finished in 2.4s'),
    )
    expect(screen.getByTestId('studio-run-toast')).toHaveAttribute('data-tone', 'ok')
  })

  it('keeps a cancelled run distinct from a failed one', async () => {
    const { settle } = mountToast()
    await settle({ ...REPORT, status: 'cancelled' })

    await waitFor(() =>
      expect(screen.getByTestId('studio-run-toast')).toHaveTextContent('Run #219 cancelled'),
    )
    expect(screen.getByTestId('studio-run-toast')).toHaveAttribute('data-tone', 'mute')
  })

  it('replaces the standing toast rather than stacking a second one', async () => {
    const { settle } = mountToast()
    await settle(REPORT)
    await waitFor(() => expect(screen.getByTestId('studio-run-toast')).toBeInTheDocument())

    await settle({ ...REPORT, runNumber: 220, status: 'failed' })

    await waitFor(() =>
      expect(screen.getByTestId('studio-run-toast')).toHaveTextContent('Run #220 failed'),
    )
    expect(screen.getAllByTestId('studio-run-toast')).toHaveLength(1)
  })

  /**
   * S11 — the reason `ToastModel` is two units rather than one. `visible` going false is the start
   * of the 120ms fade, not the end of the toast: the element has to still be in the document while
   * that plays, or the exit runs on nothing. Written as identity plus a differential class read,
   * never as a computed style — the durations belong to the stylesheet and the token gates.
   */
  it('stays in the document while its exit plays, and leaves only when it is over', async () => {
    vi.useFakeTimers()
    const { settle } = mountToast()
    await settle(REPORT)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })

    const element = screen.getByTestId('studio-run-toast')
    const shown = element.className

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TOAST_HOLD_MS)
    })

    // Still the very same node — it is fading, not gone — and no longer carrying the shown class.
    expect(screen.getByTestId('studio-run-toast')).toBe(element)
    expect(element.className).not.toBe(shown)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TOAST_EXIT_MS)
    })

    expect(screen.queryByTestId('studio-run-toast')).toBeNull()
  })
})
