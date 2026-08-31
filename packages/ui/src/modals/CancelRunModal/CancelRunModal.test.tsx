import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CancelRunModal, type CancelRunModalProps, cancelRunMessage } from './CancelRunModal.js'

afterEach(cleanup)

function renderModal(overrides: Partial<CancelRunModalProps> = {}) {
  const onDismiss = overrides.onDismiss ?? vi.fn()
  render(
    <CancelRunModal
      runNumber={219}
      elapsed="1.3s"
      nodeId="render"
      onDismiss={onDismiss}
      {...overrides}
    />,
  )
  return { onDismiss }
}

describe('cancelRunMessage', () => {
  it('sets the node identifier in mono at both ends of the sentence', () => {
    const segments = cancelRunMessage('render')
    expect(segments.filter((segment) => segment.mono === true)).toHaveLength(2)
    expect(segments.map((segment) => segment.text).join('')).toBe(
      'render finishes writing its current frame, then the run stops. Completed nodes stay cached, so a re-run resumes from render.',
    )
  })
})

describe('CancelRunModal', () => {
  it('titles itself with the run number and names the dialog with it', () => {
    renderModal()
    expect(screen.getByRole('heading', { name: 'Cancel run #219?' })).toBeInTheDocument()
    expect(screen.getByTestId('cancel-run-modal')).toHaveAttribute('aria-label', 'Cancel run #219?')
  })

  it('interpolates the run number rather than hard-coding the artboard value', () => {
    renderModal({ runNumber: 221 })
    expect(screen.getByRole('heading', { name: 'Cancel run #221?' })).toBeInTheDocument()
  })

  it('draws no header band and no ×', () => {
    renderModal()
    expect(screen.queryByTestId('modal-close')).toBeNull()
    expect(screen.queryByTestId('modal-context')).toBeNull()
  })

  it('keeps the spinner turning and prints the elapsed time', () => {
    renderModal()
    expect(screen.getByTestId('cancel-run-spinner')).toBeInTheDocument()
    expect(screen.getByTestId('cancel-run-elapsed')).toHaveTextContent('1.3s')
  })

  it('draws the body sentence with the node it was given', () => {
    renderModal({ nodeId: 'publish' })
    expect(screen.getByTestId('cancel-run-message')).toHaveTextContent(
      'publish finishes writing its current frame, then the run stops. Completed nodes stay cached, so a re-run resumes from publish.',
    )
  })

  it('draws the inverted esc hint verbatim', () => {
    renderModal()
    expect(screen.getByTestId('modal-hint')).toHaveTextContent('esc keeps running')
  })

  it('runs both footer actions', () => {
    const onKeepRunning = vi.fn()
    const onCancelRun = vi.fn()
    renderModal({ onKeepRunning, onCancelRun })
    fireEvent.click(screen.getByRole('button', { name: 'Keep running' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel run' }))
    expect(onKeepRunning).toHaveBeenCalledTimes(1)
    expect(onCancelRun).toHaveBeenCalledTimes(1)
  })

  it('rule 02 — the destructive dialog ignores a backdrop click', () => {
    const onDismiss = vi.fn()
    renderModal({ onDismiss })
    fireEvent.click(screen.getByTestId('cancel-run-modal'))
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('still answers esc, which is what `esc keeps running` promises', () => {
    const onDismiss = vi.fn()
    renderModal({ onDismiss })
    fireEvent.keyDown(screen.getByTestId('cancel-run-modal'), { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
