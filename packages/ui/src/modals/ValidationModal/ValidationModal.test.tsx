import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ValidationModal, type ValidationModalProps } from './ValidationModal.js'

afterEach(cleanup)

/** The three findings artboard `3C` draws, verbatim from `07-copy.md` §4.2. */
const artboardFindings: ValidationModalProps['findings'] = [
  {
    severity: 'error',
    code: 'TypeMismatch',
    source: 'flow.ts:41',
    message: [
      { text: 'render.markdown', mono: true },
      { text: ' expects string, receives ' },
      { text: 'Buffer', mono: true },
      { text: ' from ' },
      { text: 'start1.markdown', mono: true },
      { text: '.' },
    ],
    actions: [
      { label: 'Reveal node', tone: 'accent' },
      { label: 'Open in editor', tone: 'muted' },
    ],
  },
  {
    severity: 'error',
    code: 'UnconnectedInput',
    source: 'flow.ts:58',
    message: [
      { text: 'publish.caption', mono: true },
      { text: ' has no source. The node will be skipped at run time.' },
    ],
    actions: [{ label: 'Reveal node', tone: 'accent' }],
  },
  {
    severity: 'warning',
    code: 'UnusedOutput',
    source: 'flow.ts:44',
    message: [{ text: 'render.caption', mono: true }, { text: ' is never read downstream.' }],
  },
]

function renderModal(overrides: Partial<ValidationModalProps> = {}) {
  const onDismiss = overrides.onDismiss ?? vi.fn()
  render(
    <ValidationModal
      context="publication · flow.ts"
      findings={artboardFindings}
      onDismiss={onDismiss}
      {...overrides}
    />,
  )
  return { onDismiss }
}

describe('ValidationModal', () => {
  it('draws the artboard header', () => {
    renderModal()
    expect(screen.getByRole('heading', { name: 'Validation' })).toBeInTheDocument()
    expect(screen.getByTestId('modal-context')).toHaveTextContent('publication · flow.ts')
    expect(screen.getByTestId('validation-error-count')).toHaveTextContent('2 errors')
    expect(screen.getByTestId('validation-warning-count')).toHaveTextContent('1 warning')
  })

  it('draws every finding, in order, with its class and source ref', () => {
    renderModal()
    expect(screen.getAllByTestId('validation-code').map((node) => node.textContent)).toEqual([
      'TypeMismatch',
      'UnconnectedInput',
      'UnusedOutput',
    ])
    expect(screen.getAllByTestId('validation-source').map((node) => node.textContent)).toEqual([
      'flow.ts:41',
      'flow.ts:58',
      'flow.ts:44',
    ])
  })

  it('renders a message with its identifiers inlined', () => {
    renderModal()
    expect(screen.getAllByTestId('validation-message')[0]).toHaveTextContent(
      'render.markdown expects string, receives Buffer from start1.markdown.',
    )
  })

  it('gives a warning no action links', () => {
    renderModal()
    // Two on the first finding, one on the second, none on the warning.
    expect(screen.getAllByTestId('validation-action').map((node) => node.textContent)).toEqual([
      'Reveal node',
      'Open in editor',
      'Reveal node',
    ])
  })

  it('calls the action it was given', () => {
    const onSelect = vi.fn()
    renderModal({
      findings: [
        { ...artboardFindings[0], actions: [{ label: 'Reveal node', tone: 'accent', onSelect }] },
      ],
    })
    fireEvent.click(screen.getByTestId('validation-action'))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  it('counts pluralise, and a zero count draws no badge', () => {
    renderModal({ findings: [artboardFindings[2]] })
    expect(screen.queryByTestId('validation-error-count')).toBeNull()
    expect(screen.getByTestId('validation-warning-count')).toHaveTextContent('1 warning')
  })

  it('draws the footer verbatim', () => {
    renderModal()
    expect(screen.getByTestId('modal-hint')).toHaveTextContent('esc to close')
    expect(screen.getByRole('button', { name: /Copy report/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Re-validate' })).toBeInTheDocument()
  })

  it('runs the footer actions', () => {
    const onCopyReport = vi.fn()
    const onRevalidate = vi.fn()
    renderModal({ onCopyReport, onRevalidate })
    fireEvent.click(screen.getByRole('button', { name: /Copy report/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Re-validate' }))
    expect(onCopyReport).toHaveBeenCalledTimes(1)
    expect(onRevalidate).toHaveBeenCalledTimes(1)
  })

  it('is non-destructive: esc and the backdrop both dismiss it', () => {
    const onDismiss = vi.fn()
    renderModal({ onDismiss })
    const dialog = screen.getByTestId('validation-modal')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    fireEvent.click(dialog)
    expect(onDismiss).toHaveBeenCalledTimes(2)
  })
})
