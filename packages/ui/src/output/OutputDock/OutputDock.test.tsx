import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { JobikClient } from '#client/index.js'
import { reatomStudio, StudioModelProvider } from '#model/index.js'
import type { OutputComponentProps } from '#output/flowUi.js'
import { OutputPreview } from '#output/OutputPreview/OutputPreview.js'
import { outputMetrics } from '#output/outputTokens.js'
import { OutputDock } from './OutputDock.js'

afterEach(cleanup)

/**
 * The dock's header reads `3A`'s two cells off the model, so the dock only mounts under a
 * `StudioModelProvider` — see `OutputHeader`. Everything the dock itself draws is still a prop, and
 * no case here presses either action, so the model is left exactly as `reatomStudio` builds it.
 *
 * The returned `rerender` keeps the provider in place, so a case that re-renders the dock with new
 * props does not have to restate it.
 */
function mountDock(node: ReactNode) {
  const client = {
    listFlows: vi.fn(),
    loadFlow: vi.fn(),
    validate: vi.fn(),
    save: vi.fn(),
    startRun: vi.fn(),
    cancelRun: vi.fn(),
    assetUrl: vi.fn(() => '/api/assets/x'),
    extensionBundleUrl: vi.fn(() => '/api/flows/x/ui.js'),
  } as unknown as JobikClient
  const model = reatomStudio({ client })
  const provide = (child: ReactNode) => (
    <StudioModelProvider model={model}>{child}</StudioModelProvider>
  )
  const view = render(provide(node))
  return {
    ...view,
    rerender: (child: ReactNode) => {
      view.rerender(provide(child))
    },
  }
}

const output = {
  image: { type: 'Buffer', mime: 'image/png', bytes: 654336, id: 'a1' },
  caption: 'Release 0.4 — field-level connections',
}

/** Stands in for a flow-local component, forwarding the surface exactly as a real one should. */
function ArtboardOutput(props: OutputComponentProps) {
  return (
    <>
      <div data-testid="surface-probe">{props.surface}</div>
      <OutputPreview
        surface={props.surface}
        primary={{ label: 'cover.png', meta: ['1024×1024', 'png', '412 kb'], metaTrailing: 'sRGB' }}
        variants={[
          { label: 'og.png', caption: '1200×630 · 208 kb' },
          { label: 'thumb.png', caption: '320×320 · 34 kb' },
        ]}
        emptyVariants={1}
        typedValues={[{ name: 'caption', value: 'Release 0.4 — field-level connections' }]}
      />
    </>
  )
}

const descriptor = { nodes: { render: { Output: ArtboardOutput } } }

/**
 * Lets a connection land.
 *
 * The dock's two listener groups are owned by `withConnectHook`s, and a Reatom connection is
 * *scheduled* rather than made inside the render that asks for it — `model/shortcuts.test.ts` says
 * the same about the disconnect. Nothing in the Studio can notice, because a keypress or a drag
 * arrives many ticks after the dock is on screen; a test that dispatches a real event one statement
 * after mounting has to wait for what the browser would have waited for anyway.
 */
async function listening(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** jsdom has no `PointerEvent`, so the two properties the dock reads are set by hand. */
function pointerEvent(type: string, clientY: number): Event {
  const event = new Event(type, { bubbles: true })
  Object.defineProperty(event, 'clientY', { value: clientY })
  return event
}

describe('OutputDock — the open dock', () => {
  it('reproduces the 2A header: tabs, context line, both actions, esc and close', () => {
    mountDock(
      <OutputDock
        nodeId="render"
        output={output}
        descriptor={descriptor}
        context="render.image · Buffer[3] · run #221"
        onClose={() => {}}
      />,
    )
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Preview',
      'Raw',
      'Logs',
    ])
    expect(screen.getByTestId('output-viewer-source')).toHaveTextContent(
      'render.image · Buffer[3] · run #221',
    )
    expect(screen.getByRole('button', { name: 'Copy all' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
    expect(screen.getByTestId('output-dock-esc')).toHaveTextContent('esc')
    expect(screen.getByRole('button', { name: 'Close output' })).toBeInTheDocument()
  })

  it('opens on Preview and renders the flow-local body at the dock surface', () => {
    mountDock(<OutputDock nodeId="render" output={output} descriptor={descriptor} />)
    expect(screen.getByTestId('surface-probe')).toHaveTextContent('dock')
    expect(screen.getByTestId('output-primary')).toBeInTheDocument()
    expect(screen.getAllByTestId('output-variant')).toHaveLength(2)
    expect(screen.getByTestId('output-variant-empty-label')).toHaveTextContent('no variant')
    expect(screen.getByTestId('output-typed-values')).toBeInTheDocument()
  })

  it('draws the resize handle the artboard puts above the header', () => {
    mountDock(<OutputDock nodeId="render" output={output} />)
    expect(screen.getByTestId('output-dock-handle')).toBeInTheDocument()
  })

  it('switches tab on its own and reports the change', async () => {
    const onTabChange = vi.fn()
    mountDock(<OutputDock nodeId="render" output={output} onTabChange={onTabChange} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Raw' }))
    expect(onTabChange).toHaveBeenCalledWith('raw')
    expect(screen.getAllByTestId('raw-json-gutter').length).toBeGreaterThan(0)
  })

  it('lets a caller drive the tab, ignoring its own state', async () => {
    const onTabChange = vi.fn()
    mountDock(<OutputDock nodeId="render" output={output} tab="logs" onTabChange={onTabChange} />)
    expect(screen.getByRole('tab', { name: 'Logs' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(screen.getByRole('tab', { name: 'Raw' }))
    expect(onTabChange).toHaveBeenCalledWith('raw')
    expect(screen.getByRole('tab', { name: 'Logs' })).toHaveAttribute('aria-selected', 'true')
  })

  it('drops the context line off Preview, where the size readout takes the slot', async () => {
    mountDock(
      <OutputDock nodeId="render" output={output} context="render.image · Buffer[3] · run #221" />,
    )
    await userEvent.click(screen.getByRole('tab', { name: 'Raw' }))
    expect(screen.queryByTestId('output-viewer-source')).toBeNull()
    expect(screen.getByTestId('output-viewer-meta')).toHaveTextContent(/^json · /)
  })

  it('omits the dismiss group entirely when nothing is wired to it', () => {
    mountDock(<OutputDock nodeId="render" output={output} />)
    expect(screen.queryByTestId('output-dock-esc')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Close output' })).toBeNull()
  })
})

describe('OutputDock — dismissal', () => {
  it('closes on the × in its own header', async () => {
    const onClose = vi.fn()
    mountDock(<OutputDock nodeId="render" output={output} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Close output' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape from anywhere in the app', async () => {
    const onClose = vi.fn()
    mountDock(<OutputDock nodeId="render" output={output} onClose={onClose} />)
    await listening()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores every other key', async () => {
    const onClose = vi.fn()
    mountDock(<OutputDock nodeId="render" output={output} onClose={onClose} />)
    await listening()
    fireEvent.keyDown(window, { key: 'Enter' })
    fireEvent.keyDown(window, { key: 'e' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('stops listening once it is closed, and once it unmounts', async () => {
    const onClose = vi.fn()
    const view = mountDock(<OutputDock nodeId="render" output={output} onClose={onClose} />)
    await listening()
    view.rerender(<OutputDock nodeId="render" output={output} open={false} onClose={onClose} />)
    await listening()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()

    view.rerender(<OutputDock nodeId="render" output={output} onClose={onClose} />)
    await listening()
    view.unmount()
    await listening()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('OutputDock — the collapsed strip', () => {
  it('reports the file count instead of the type, and offers Show output', async () => {
    const onOpen = vi.fn()
    mountDock(
      <OutputDock
        nodeId="render"
        output={output}
        open={false}
        summary="render.image · 3 files · run #221"
        onOpen={onOpen}
      />,
    )
    expect(screen.getByText('Output')).toBeInTheDocument()
    expect(screen.getByTestId('output-dock-summary')).toHaveTextContent(
      'render.image · 3 files · run #221',
    )
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.queryByTestId('output-dock-handle')).toBeNull()

    await userEvent.click(screen.getByTestId('output-dock-show'))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('omits the expand button when there is nothing to expand to', () => {
    mountDock(<OutputDock nodeId="render" output={output} open={false} />)
    expect(screen.queryByTestId('output-dock-show')).toBeNull()
  })
})

describe('OutputDock — resizing', () => {
  it('grows as the handle is dragged upward and reports the new height', async () => {
    const onHeightChange = vi.fn()
    mountDock(<OutputDock nodeId="render" output={output} onHeightChange={onHeightChange} />)

    // The trio's lifetime is the drag: the press is what makes this render read the atom that owns
    // them, so the listeners exist from here to the release and at no other time.
    fireEvent(screen.getByTestId('output-dock-handle'), pointerEvent('pointerdown', 700))
    await listening()
    act(() => {
      window.dispatchEvent(pointerEvent('pointermove', 600))
    })
    expect(onHeightChange).toHaveBeenLastCalledWith(outputMetrics.dockHeight + 100)
  })

  it('never shrinks below the chrome it always draws', async () => {
    const onHeightChange = vi.fn()
    mountDock(<OutputDock nodeId="render" output={output} onHeightChange={onHeightChange} />)

    fireEvent(screen.getByTestId('output-dock-handle'), pointerEvent('pointerdown', 700))
    await listening()
    act(() => {
      window.dispatchEvent(pointerEvent('pointermove', 2000))
    })
    expect(onHeightChange).toHaveBeenLastCalledWith(
      outputMetrics.dockHandleHeight + outputMetrics.headerHeight,
    )
  })

  it('stops tracking the pointer once it is released', async () => {
    const onHeightChange = vi.fn()
    mountDock(<OutputDock nodeId="render" output={output} onHeightChange={onHeightChange} />)

    fireEvent(screen.getByTestId('output-dock-handle'), pointerEvent('pointerdown', 700))
    await listening()
    act(() => {
      window.dispatchEvent(pointerEvent('pointermove', 620))
    })
    expect(onHeightChange).toHaveBeenLastCalledWith(outputMetrics.dockHeight + 80)

    act(() => {
      window.dispatchEvent(pointerEvent('pointerup', 620))
    })
    await listening()
    onHeightChange.mockClear()
    act(() => {
      window.dispatchEvent(pointerEvent('pointermove', 500))
    })
    expect(onHeightChange).not.toHaveBeenCalled()
  })
})
