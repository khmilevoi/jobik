import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JobikClient, WireRunReportPayload } from '#client/index.js'
import type { StudioDeps } from '#model/index.js'
import { reatomStudio, StudioModelProvider } from '#model/index.js'
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

const connected: (() => void)[] = []

afterEach(() => {
  for (const off of connected.splice(0)) off()
  cleanup()
})

function mountToast(): { settle: (report: WireRunReportPayload) => Promise<void> } {
  const deps: StudioDeps = { client: stubClient(), now: () => 1_700_000_000_000 }
  const model = reatomStudio(deps)
  // The hold runs on `wrap(sleep(…))`; dismissing at teardown is what drops it rather than leaving
  // a 2.8s timer behind every case.
  connected.push(() => model.toast.dismiss())

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
})
