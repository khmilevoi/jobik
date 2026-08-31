import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StackTraceModal, type StackTraceModalProps } from './StackTraceModal.js'

afterEach(cleanup)

/** The trace artboard `3C` draws, verbatim from `07-copy.md` §4.4. */
const artboardFrames: StackTraceModalProps['frames'] = [
  { fn: 'imageOut.raster', file: 'imageOut.ts', line: 184 },
  { fn: 'imageOut.invoke', file: 'imageOut.ts', line: 96 },
  { fn: 'render.invoke', file: 'flow.ts', line: 41 },
  { fn: 'runtime.step', file: 'runtime.ts', line: 512 },
]

const artboardMeta: StackTraceModalProps['meta'] = [
  { label: 'node', value: 'render · imageOut', tone: 'lifted' },
  { label: 'input', value: 'markdown · 1.4 kb', tone: 'lifted' },
  { label: 'runtime', value: '0.9.2 · node 20.11', tone: 'muted' },
]

function renderModal(overrides: Partial<StackTraceModalProps> = {}) {
  const onDismiss = overrides.onDismiss ?? vi.fn()
  render(
    <StackTraceModal
      context="render · run #220 · 0.8s"
      errorClass="ImageRenderError"
      errorMessage={[
        {
          text: 'Unsupported colour profile in the inlined asset. The node produced no output, so ',
        },
        { text: 'publish', mono: true },
        { text: ' was skipped.' },
      ]}
      frames={artboardFrames}
      hiddenFrames={6}
      meta={artboardMeta}
      copied
      onDismiss={onDismiss}
      {...overrides}
    />,
  )
  return { onDismiss }
}

describe('StackTraceModal', () => {
  it('draws the artboard header', () => {
    renderModal()
    expect(screen.getByRole('heading', { name: 'Stack trace' })).toBeInTheDocument()
    expect(screen.getByTestId('modal-context')).toHaveTextContent('render · run #220 · 0.8s')
  })

  it('draws the settled Copied confirmation when the trace has been copied', () => {
    renderModal()
    expect(screen.getByTestId('trace-copied')).toHaveTextContent('Copied')
    expect(screen.queryByTestId('trace-copy')).toBeNull()
  })

  it('draws the idle copy control otherwise, and reports a press', () => {
    const onCopy = vi.fn()
    renderModal({ copied: false, onCopy })
    expect(screen.queryByTestId('trace-copied')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(onCopy).toHaveBeenCalledTimes(1)
  })

  it('draws the error class and its sentence', () => {
    renderModal()
    expect(screen.getByTestId('trace-error-class')).toHaveTextContent('ImageRenderError')
    expect(screen.getByTestId('trace-error-message')).toHaveTextContent(
      'Unsupported colour profile in the inlined asset. The node produced no output, so publish was skipped.',
    )
  })

  it('numbers every frame and prints its source location', () => {
    renderModal()
    expect(screen.getAllByTestId('trace-frame').map((node) => node.textContent)).toEqual([
      '1 at imageOut.raster (imageOut.ts:184)',
      '2 at imageOut.invoke (imageOut.ts:96)',
      '3 at render.invoke (flow.ts:41)',
      '4 at runtime.step (runtime.ts:512)',
    ])
  })

  it('discloses the hidden frames and reports the press', () => {
    const onShowHiddenFrames = vi.fn()
    renderModal({ onShowHiddenFrames })
    const disclosure = screen.getByTestId('trace-hidden-frames')
    expect(disclosure).toHaveTextContent('↳ show 6 hidden frames')
    fireEvent.click(disclosure)
    expect(onShowHiddenFrames).toHaveBeenCalledTimes(1)
  })

  it('draws no disclosure when nothing is hidden, and singularises one', () => {
    renderModal({ hiddenFrames: 0 })
    expect(screen.queryByTestId('trace-hidden-frames')).toBeNull()
    cleanup()
    renderModal({ hiddenFrames: 1 })
    expect(screen.getByTestId('trace-hidden-frames')).toHaveTextContent('↳ show 1 hidden frame')
  })

  it('draws the context grid', () => {
    renderModal()
    expect(screen.getAllByTestId('trace-meta-label').map((node) => node.textContent)).toEqual([
      'node',
      'input',
      'runtime',
    ])
    expect(screen.getAllByTestId('trace-meta-value').map((node) => node.textContent)).toEqual([
      'render · imageOut',
      'markdown · 1.4 kb',
      '0.9.2 · node 20.11',
    ])
  })

  it('draws the footer verbatim and runs both actions', () => {
    const onSaveTrace = vi.fn()
    const onRetryNode = vi.fn()
    renderModal({ onSaveTrace, onRetryNode })
    expect(screen.getByTestId('modal-hint')).toHaveTextContent('esc to close')
    fireEvent.click(screen.getByRole('button', { name: /Save trace/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry node' }))
    expect(onSaveTrace).toHaveBeenCalledTimes(1)
    expect(onRetryNode).toHaveBeenCalledTimes(1)
  })

  it('is non-destructive: esc and the backdrop both dismiss it', () => {
    const onDismiss = vi.fn()
    renderModal({ onDismiss })
    const dialog = screen.getByTestId('stack-trace-modal')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    fireEvent.click(dialog)
    expect(onDismiss).toHaveBeenCalledTimes(2)
  })
})
