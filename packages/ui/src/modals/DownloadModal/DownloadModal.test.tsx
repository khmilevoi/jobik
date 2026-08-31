import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DownloadModal, type DownloadModalProps } from './DownloadModal.js'

afterEach(cleanup)

/** The three files artboard `3C` draws, verbatim from `07-copy.md` §4.3. */
const artboardFiles: DownloadModalProps['files'] = [
  { name: 'cover.png', meta: '1024² · 412 kb', selected: true },
  { name: 'og.png', meta: '1200×630 · 208 kb', selected: true },
  { name: 'thumb.png', meta: '320² · 34 kb', selected: false },
]

function renderModal(overrides: Partial<DownloadModalProps> = {}) {
  const onDismiss = overrides.onDismiss ?? vi.fn()
  render(
    <DownloadModal
      context="render.image · run #221"
      files={artboardFiles}
      format="png"
      bundleAsZip
      zipFileName="jobik-221-output.zip"
      summary="2 of 3 files · 620 kb"
      totalSize="620 kb"
      onDismiss={onDismiss}
      {...overrides}
    />,
  )
  return { onDismiss }
}

describe('DownloadModal', () => {
  it('draws the artboard header', () => {
    renderModal()
    expect(screen.getByRole('heading', { name: 'Download output' })).toBeInTheDocument()
    expect(screen.getByTestId('modal-context')).toHaveTextContent('render.image · run #221')
  })

  it('draws every file row with its name and metadata', () => {
    renderModal()
    expect(screen.getAllByTestId('download-file')).toHaveLength(3)
    expect(screen.getAllByTestId('download-file-name').map((node) => node.textContent)).toEqual([
      'cover.png',
      'og.png',
      'thumb.png',
    ])
    expect(screen.getAllByTestId('download-file-meta').map((node) => node.textContent)).toEqual([
      '1024² · 412 kb',
      '1200×630 · 208 kb',
      '320² · 34 kb',
    ])
  })

  it('checks the selected files and leaves the rest unchecked', () => {
    renderModal()
    expect(screen.getByRole('checkbox', { name: 'cover.png' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'og.png' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'thumb.png' })).not.toBeChecked()
  })

  it('reports a toggled file by name', () => {
    const onToggleFile = vi.fn()
    renderModal({ onToggleFile })
    fireEvent.click(screen.getByRole('checkbox', { name: 'thumb.png' }))
    expect(onToggleFile).toHaveBeenCalledWith('thumb.png')
  })

  it('offers the three formats and marks the selected one', () => {
    renderModal()
    // The options are `SegmentedControl`'s now, so they are addressed by role rather than by a
    // test id this modal used to attach to its own copy.
    expect(screen.getAllByRole('radio').map((node) => node.closest('label')?.textContent)).toEqual([
      'png',
      'webp',
      'jpg',
    ])
    expect(screen.getByRole('radio', { name: 'png' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'webp' })).not.toBeChecked()
  })

  it('reports a format change', () => {
    const onFormatChange = vi.fn()
    renderModal({ onFormatChange })
    fireEvent.click(screen.getByRole('radio', { name: 'webp' }))
    expect(onFormatChange).toHaveBeenCalledWith('webp')
  })

  it('draws the zip toggle with the resulting file name under its label', () => {
    renderModal()
    expect(screen.getByRole('switch', { name: 'Bundle as zip' })).toBeChecked()
    expect(screen.getByTestId('download-zip-name')).toHaveTextContent('jobik-221-output.zip')
  })

  it('reports the toggle flipping off', () => {
    const onBundleChange = vi.fn()
    renderModal({ onBundleChange })
    fireEvent.click(screen.getByRole('switch', { name: 'Bundle as zip' }))
    expect(onBundleChange).toHaveBeenCalledWith(false)
  })

  it('reports the toggle flipping on from its extrapolated off state', () => {
    const onBundleChange = vi.fn()
    renderModal({ bundleAsZip: false, onBundleChange })
    expect(screen.getByRole('switch', { name: 'Bundle as zip' })).not.toBeChecked()
    fireEvent.click(screen.getByRole('switch', { name: 'Bundle as zip' }))
    expect(onBundleChange).toHaveBeenCalledWith(true)
  })

  it('draws the footer summary and both actions', () => {
    renderModal()
    expect(screen.getByTestId('modal-hint')).toHaveTextContent('2 of 3 files · 620 kb')
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Download/ })).toHaveTextContent('Download620 kb')
  })

  it('runs the footer actions', () => {
    const onCancel = vi.fn()
    const onDownload = vi.fn()
    renderModal({ onCancel, onDownload })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: /Download/ }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onDownload).toHaveBeenCalledTimes(1)
  })

  it('is non-destructive: esc and the backdrop both dismiss it', () => {
    const onDismiss = vi.fn()
    renderModal({ onDismiss })
    const dialog = screen.getByTestId('download-modal')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    fireEvent.click(dialog)
    expect(onDismiss).toHaveBeenCalledTimes(2)
  })
})
