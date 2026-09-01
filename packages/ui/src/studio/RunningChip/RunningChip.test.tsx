import { type Atom, atom } from '@reatom/core'
import { reatomComponent } from '@reatom/react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { Profiler } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StudioModelProvider, useStudioModel } from '#model/index.js'
import type { StudioModel } from '#model/types.js'
import { RunningChip, SaveConflictChip } from './RunningChip.js'

afterEach(cleanup)

/**
 * A model carrying nothing but the run clock and the flag beside it.
 *
 * The same shape `canvas/NodeCard/NodeCard.test.tsx` builds for the same reason: the subject is one
 * number reaching one element, and driving a real `reatomStudio` through a stub stream would put a
 * flow listing, a draft and a 100ms connect hook between the write and the assertion without
 * changing what is asserted. `elapsedMs` is a plain atom here so a case can move the clock by hand;
 * on the real model it is a `computed` the ticker invalidates, which reaches a reader identically.
 */
interface ClockWorld {
  readonly model: StudioModel
  readonly elapsedMs: Atom<number>
  readonly running: Atom<boolean>
}

function clockWorld(): ClockWorld {
  const elapsedMs = atom(1_300, 'test.run.elapsedMs')
  const running = atom(true, 'test.run.running')
  return {
    model: { run: { elapsedMs, running } } as unknown as StudioModel,
    elapsedMs,
    running,
  }
}

describe('RunningChip', () => {
  it('reads Running, the start id and the elapsed time', () => {
    const world = clockWorld()
    render(
      <StudioModelProvider model={world.model}>
        <RunningChip startId="start1" />
      </StudioModelProvider>,
    )

    expect(screen.getByTestId('studio-running-chip').textContent).toContain('Running')
    expect(screen.getByTestId('studio-running-start').textContent).toBe('start1')
    expect(screen.getByTestId('studio-running-elapsed').textContent).toBe('1.3s')
  })

  it('reprints the elapsed the model publishes, without being handed one', async () => {
    const world = clockWorld()
    render(
      <StudioModelProvider model={world.model}>
        <RunningChip startId="start1" />
      </StudioModelProvider>,
    )

    await act(async () => {
      world.elapsedMs.set(2_400)
    })

    await waitFor(() =>
      expect(screen.getByTestId('studio-running-elapsed').textContent).toBe('2.4s'),
    )
  })

  it('cancels from the chip', async () => {
    const world = clockWorld()
    const onCancel = vi.fn()
    render(
      <StudioModelProvider model={world.model}>
        <RunningChip startId="start1" onCancel={onCancel} />
      </StudioModelProvider>,
    )

    await userEvent.click(screen.getByTestId('studio-running-cancel'))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  /**
   * The whole reason the clock moved in here, stated as the only thing that can prove it: a render
   * count.
   *
   * `elapsedMs` ticks every 100ms for the length of a run. While `StudioAppBody` read it — purely to
   * format the four characters this chip prints — every tick re-rendered the canvas column, both
   * sidebars, the run dock and the output dock ten times a second. `Shell` below stands in for that
   * body: a `reatomComponent` reading the same model, mounted beside the chip, which re-renders
   * whenever a read of its own is invalidated and at no other time.
   *
   * A `<Profiler>` reports only the commits its own subtree took part in, so the silence from
   * `shell` is the claim. `running` is written afterwards to show the probe is live rather than
   * merely disconnected — a shell that never re-renders at all would pass this vacuously.
   */
  it('takes the clock’s re-render alone, and leaves the shell beside it untouched', async () => {
    const world = clockWorld()
    const Shell = reatomComponent(function Shell() {
      return <div data-testid="shell">{useStudioModel().run.running() ? 'running' : 'idle'}</div>
    }, 'Shell')

    const renders = new Map<string, number>()
    const count = (id: string) => {
      renders.set(id, (renders.get(id) ?? 0) + 1)
    }

    render(
      <StudioModelProvider model={world.model}>
        <Profiler id="shell" onRender={() => count('shell')}>
          <Shell />
        </Profiler>
        <Profiler id="chip" onRender={() => count('chip')}>
          <RunningChip startId="start1" />
        </Profiler>
      </StudioModelProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('shell')).toHaveTextContent('running'))
    renders.clear()

    // Ten ticks — one second of a real run.
    for (let tick = 1; tick <= 10; tick++) {
      await act(async () => {
        world.elapsedMs.set(1_300 + tick * 100)
      })
    }
    await waitFor(() =>
      expect(screen.getByTestId('studio-running-elapsed').textContent).toBe('2.3s'),
    )

    expect(renders.get('chip')).toBeGreaterThan(0)
    expect(renders.get('shell') ?? 0).toBe(0)

    // ...and the shell's own probe is live: something it actually reads still reaches it.
    renders.clear()
    await act(async () => {
      world.running.set(false)
    })
    await waitFor(() => expect(screen.getByTestId('shell')).toHaveTextContent('idle'))
    expect(renders.get('shell')).toBeGreaterThan(0)
  })
})

describe('SaveConflictChip', () => {
  it('offers reload and copy-draft, and never a save-anyway', () => {
    render(<SaveConflictChip />)

    expect(screen.getByTestId('studio-conflict-chip').textContent).toContain('changed on disk')
    expect(screen.getByTestId('studio-conflict-reload')).toBeInTheDocument()
    expect(screen.getByTestId('studio-conflict-copy')).toBeInTheDocument()
    expect(screen.queryByText(/overwrite/i)).toBeNull()
  })

  it('calls each action', async () => {
    const onReload = vi.fn()
    const onCopyDraft = vi.fn()
    render(<SaveConflictChip onReload={onReload} onCopyDraft={onCopyDraft} />)

    await userEvent.click(screen.getByTestId('studio-conflict-reload'))
    await userEvent.click(screen.getByTestId('studio-conflict-copy'))

    expect(onReload).toHaveBeenCalledTimes(1)
    expect(onCopyDraft).toHaveBeenCalledTimes(1)
  })
})
