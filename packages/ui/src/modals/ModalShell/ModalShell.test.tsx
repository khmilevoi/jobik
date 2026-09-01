import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModalShell } from './ModalShell.js'

afterEach(cleanup)

/**
 * Structure, copy and dismissal — never appearance. The discipline gates
 * (`cssModuleValues.test.ts`, `cssModuleUsage.test.ts`) are what guard the colours and the classes.
 *
 * jsdom implements `<dialog>` without `showModal`, so these exercise the component's `open`
 * fallback branch. That is also why there is no focus-trap assertion here: the trap is the
 * platform's, and jsdom has no top layer to test it in.
 */
function renderShell(overrides: Partial<Parameters<typeof ModalShell>[0]> = {}) {
  const onDismiss = overrides.onDismiss ?? vi.fn()
  render(
    <ModalShell
      title="Validation"
      width={560}
      bodyGap={10}
      header={{ context: 'publication · flow.ts', onClose: onDismiss }}
      hint="esc to close"
      actions={<button type="button">Re-validate</button>}
      onDismiss={onDismiss}
      {...overrides}
    >
      <p>a finding</p>
    </ModalShell>,
  )
  return { dialog: screen.getByTestId('modal'), onDismiss }
}

describe('ModalShell', () => {
  it('is a dialog with the title as its accessible name', () => {
    const { dialog } = renderShell()
    expect(dialog.tagName).toBe('DIALOG')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', 'Validation')
    expect(dialog.hasAttribute('open')).toBe(true)
  })

  it('draws the title, the mono context line, the footer hint and the body', () => {
    renderShell()
    expect(screen.getByRole('heading', { name: 'Validation' })).toBeInTheDocument()
    expect(screen.getByTestId('modal-context')).toHaveTextContent('publication · flow.ts')
    expect(screen.getByTestId('modal-hint')).toHaveTextContent('esc to close')
    expect(screen.getByTestId('modal-body')).toHaveTextContent('a finding')
  })

  it('dismisses on the × ', () => {
    const onDismiss = vi.fn()
    renderShell({ onDismiss })
    fireEvent.click(screen.getByTestId('modal-close'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('dismisses on esc', () => {
    const onDismiss = vi.fn()
    const { dialog } = renderShell({ onDismiss })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('ignores every other key', () => {
    const onDismiss = vi.fn()
    const { dialog } = renderShell({ onDismiss })
    fireEvent.keyDown(dialog, { key: 'Enter' })
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('dismisses on a backdrop click', () => {
    const onDismiss = vi.fn()
    const { dialog } = renderShell({ onDismiss })
    fireEvent.click(dialog)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does not dismiss when the click landed inside the card', () => {
    const onDismiss = vi.fn()
    renderShell({ onDismiss })
    fireEvent.click(screen.getByTestId('modal-body'))
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('rule 02 — a destructive dialog ignores the backdrop but still answers esc', () => {
    const onDismiss = vi.fn()
    const { dialog } = renderShell({ destructive: true, onDismiss })
    fireEvent.click(dialog)
    expect(onDismiss).not.toHaveBeenCalled()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('draws no header band, and no ×, when the header is omitted', () => {
    renderShell({ header: undefined })
    expect(screen.queryByTestId('modal-close')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Validation' })).toBeNull()
    // The dialog is still named, which is the whole reason `title` is a string.
    expect(screen.getByTestId('modal')).toHaveAttribute('aria-label', 'Validation')
  })

  it('draws no × when the header supplies no onClose', () => {
    renderShell({ header: { context: 'publication · flow.ts' } })
    expect(screen.queryByTestId('modal-close')).toBeNull()
  })

  /**
   * `4A`'s two phases, as the attribute the stylesheet selects on. What each phase *looks* like is
   * the gates' business; that the shell reports which one it is in is this file's.
   */
  it('reports its phase, and reports back when the departure is over', () => {
    const onExited = vi.fn()
    const { dialog } = renderShell({ onExited })
    expect(dialog).toHaveAttribute('data-phase', 'open')
    expect(onExited).not.toHaveBeenCalled()

    cleanup()
    const leaving = renderShell({ leaving: true, onExited })
    expect(leaving.dialog).toHaveAttribute('data-phase', 'leaving')
    // jsdom applies no stylesheet, so the card's exit animation is zero-length and the hold is
    // over in the same tick. A browser waits `--jbk-motion-duration-exit` instead, and reduced
    // motion puts it back to zero.
    expect(onExited).toHaveBeenCalledTimes(1)
  })

  it('restores focus to whatever was focused when it opened', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const { unmount } = render(
      <ModalShell title="Validation" width={560} bodyGap={10} onDismiss={vi.fn()}>
        <p>a finding</p>
      </ModalShell>,
    )
    unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
})
