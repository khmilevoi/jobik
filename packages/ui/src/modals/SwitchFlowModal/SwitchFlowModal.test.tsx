import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  SwitchFlowModal,
  type SwitchFlowModalProps,
  switchFlowRunningMessage,
  switchFlowRunningMeta,
  switchFlowUnsavedMessage,
  switchFlowUnsavedMeta,
} from './SwitchFlowModal.js'

afterEach(cleanup)

const UNSAVED = {
  kind: 'unsaved',
  documentFile: 'flow.jobik.json',
  unsavedChanges: 4,
} as const

const RUNNING = {
  kind: 'running',
  runNumber: 221,
  elapsed: '1.3s',
  nodeId: 'render',
} as const

function renderModal(overrides: Partial<SwitchFlowModalProps> = {}) {
  const onDismiss = overrides.onDismiss ?? vi.fn()
  render(
    <SwitchFlowModal
      currentFlowName="publication"
      targetFlowName="digest"
      body={UNSAVED}
      {...overrides}
      onDismiss={onDismiss}
    />,
  )
  return { onDismiss }
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
  it('titles itself with the flow being opened and names the dialog with it', () => {
    renderModal()

    expect(screen.getByRole('heading', { name: 'Switch to digest?' })).toBeInTheDocument()
    expect(screen.getByTestId('switch-flow-modal')).toHaveAttribute(
      'aria-label',
      'Switch to digest?',
    )
  })

  it('interpolates the target rather than hard-coding the artboard value', () => {
    renderModal({ targetFlowName: 'forecast' })

    expect(screen.getByRole('heading', { name: 'Switch to forecast?' })).toBeInTheDocument()
  })

  it('draws no header band and no ×', () => {
    renderModal()

    expect(screen.queryByTestId('modal-close')).toBeNull()
    expect(screen.queryByTestId('modal-context')).toBeNull()
  })

  it('spells the third action into the footer hint, naming the flow it stays in', () => {
    renderModal()

    expect(screen.getByTestId('modal-hint')).toHaveTextContent('esc stays in publication')
  })

  it('offers two actions and never a third', () => {
    renderModal()

    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('is destructive: a backdrop click does not dismiss it', () => {
    const onDismiss = vi.fn()
    renderModal({ onDismiss })

    fireEvent.click(screen.getByTestId('switch-flow-modal'))

    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('answers esc, which is what the hint promises', () => {
    const onDismiss = vi.fn()
    renderModal({ onDismiss })

    fireEvent.keyDown(screen.getByTestId('switch-flow-modal'), { key: 'Escape' })

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})

describe('SwitchFlowModal — unsaved draft', () => {
  it('marks itself with the top bar’s unsaved dot and nothing that moves', () => {
    renderModal()

    expect(screen.getByTestId('switch-flow-dot')).toBeInTheDocument()
    expect(screen.queryByTestId('switch-flow-spinner')).toBeNull()
  })

  it('counts the unsaved changes it was given', () => {
    renderModal({ body: { ...UNSAVED, unsavedChanges: 7 } })

    expect(screen.getByTestId('switch-flow-meta')).toHaveTextContent('7 unsaved changes')
  })

  it('draws the body sentence over the flow, its file and the target', () => {
    renderModal({ body: { ...UNSAVED, documentFile: 'pokedex.jobik.json' } })

    expect(screen.getByTestId('switch-flow-message')).toHaveTextContent(
      'publication has edits that are not in pokedex.jobik.json yet. Opening digest closes the draft, and a discarded draft cannot be recovered.',
    )
  })

  it('runs the ghost that sacrifices the draft and the primary that keeps it', () => {
    const onDiscardChanges = vi.fn()
    const onSaveAndSwitch = vi.fn()
    renderModal({ body: { ...UNSAVED, onDiscardChanges, onSaveAndSwitch } })

    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save and switch' }))

    expect(onDiscardChanges).toHaveBeenCalledTimes(1)
    expect(onSaveAndSwitch).toHaveBeenCalledTimes(1)
  })
})

describe('SwitchFlowModal — run in progress', () => {
  it('keeps the spinner turning, because the run has not stopped', () => {
    renderModal({ body: RUNNING })

    expect(screen.getByTestId('switch-flow-spinner')).toBeInTheDocument()
    expect(screen.queryByTestId('switch-flow-dot')).toBeNull()
  })

  it('names the run and its elapsed time', () => {
    renderModal({ body: RUNNING })

    expect(screen.getByTestId('switch-flow-meta')).toHaveTextContent('run #221 · 1.3s')
  })

  it('draws the body sentence over the node still working', () => {
    renderModal({ body: { ...RUNNING, nodeId: 'publish' } })

    expect(screen.getByTestId('switch-flow-message')).toHaveTextContent(
      'publish keeps running on the server once publication closes, and run #221 lands in its history either way. Cancel it here if it should stop.',
    )
  })

  it('runs the ghost that sacrifices the run and the primary that keeps it', () => {
    const onCancelAndSwitch = vi.fn()
    const onSwitchAndKeepRunning = vi.fn()
    renderModal({ body: { ...RUNNING, onCancelAndSwitch, onSwitchAndKeepRunning } })

    fireEvent.click(screen.getByRole('button', { name: 'Cancel and switch' }))
    fireEvent.click(screen.getByRole('button', { name: 'Switch and keep running' }))

    expect(onCancelAndSwitch).toHaveBeenCalledTimes(1)
    expect(onSwitchAndKeepRunning).toHaveBeenCalledTimes(1)
  })
})
