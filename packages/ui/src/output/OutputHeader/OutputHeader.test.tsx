import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OutputHeader } from './OutputHeader.js'

afterEach(cleanup)

describe('OutputHeader', () => {
  it('draws the three tabs in the order the design fixes', () => {
    render(<OutputHeader variant="card" tab="preview" onTabChange={() => {}} />)
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Preview',
      'Raw',
      'Logs',
    ])
  })

  it('marks the active tab selected and the others not', () => {
    render(<OutputHeader variant="dock" tab="raw" onTabChange={() => {}} />)
    expect(screen.getByRole('tab', { name: 'Raw' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: 'Logs' })).toHaveAttribute('aria-selected', 'false')
  })

  it('reports the tab a click selects', async () => {
    const onTabChange = vi.fn()
    render(<OutputHeader variant="card" tab="preview" onTabChange={onTabChange} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Logs' }))
    expect(onTabChange).toHaveBeenCalledWith('logs')
  })

  it('hides the 1 × 16 rule with the context line it introduces', () => {
    const { rerender } = render(
      <OutputHeader variant="card" tab="preview" onTabChange={() => {}} />,
    )
    expect(screen.queryByTestId('output-viewer-divider')).toBeNull()
    expect(screen.queryByTestId('output-viewer-source')).toBeNull()

    rerender(
      <OutputHeader
        variant="dock"
        tab="preview"
        onTabChange={() => {}}
        context="render.image · Buffer[3] · run #221"
      />,
    )
    expect(screen.getByTestId('output-viewer-divider')).toBeInTheDocument()
    expect(screen.getByTestId('output-viewer-source')).toHaveTextContent(
      'render.image · Buffer[3] · run #221',
    )
  })

  it('draws the actions and the trailing slot in one group', () => {
    render(
      <OutputHeader
        variant="dock"
        tab="preview"
        onTabChange={() => {}}
        onCopyAll={() => {}}
        onDownload={() => {}}
        trailing={<div data-testid="trailing" />}
      />,
    )
    expect(screen.getByRole('button', { name: 'Copy all' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
    expect(screen.getByTestId('trailing')).toBeInTheDocument()
  })

  it('omits an action the caller did not wire', () => {
    render(
      <OutputHeader variant="card" tab="preview" onTabChange={() => {}} onCopyAll={() => {}} />,
    )
    expect(screen.getByRole('button', { name: 'Copy all' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
  })

  it('shows the right-hand mono readout when one is supplied', () => {
    render(<OutputHeader variant="card" tab="raw" onTabChange={() => {}} meta="json · 1.4 kb" />)
    expect(screen.getByTestId('output-viewer-meta')).toHaveTextContent('json · 1.4 kb')
  })
})

/**
 * `3A`'s sequences, from the header that owns them. The button reports the work because nothing
 * else on this row does — the decision table's "in-button loader" column.
 *
 * The *timing* is not retested here: `primitives/actionState.test.ts` already pins the 400 ms
 * threshold, the 1.6 s hold and the 1.8 s hold against a fake clock, and doing it again through a
 * render would only be the same assertion with a DOM in the way. What this file owns is the
 * wiring — that the label swaps to the cell the artboard draws, and that the callback runs.
 */
describe('OutputHeader — the copy and download sequences', () => {
  it('runs the copy sequence and swaps the label to the artboard cell', async () => {
    const onCopyAll = vi.fn()
    render(
      <OutputHeader variant="dock" tab="preview" onTabChange={() => {}} onCopyAll={onCopyAll} />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Copy all' }))
    expect(onCopyAll).toHaveBeenCalledTimes(1)
    // Rule 01: a clipboard write is synchronous, so it goes straight to `Copied` — no spinner.
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  /** An `Error` returned is the failure path — the browser refusing the clipboard. */
  it('shows the failed cell when the write returns an Error', async () => {
    render(
      <OutputHeader
        variant="dock"
        tab="preview"
        onTabChange={() => {}}
        onCopyAll={() => new Error('clipboard blocked by the browser')}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Copy all' }))
    expect(await screen.findByRole('button', { name: 'Copy failed' })).toBeInTheDocument()
  })

  /**
   * Rule 03: no byte count reaches the wire, so the download never leaves the indeterminate
   * branch — spinner, then `Saved`. It must never show a percentage it cannot know.
   */
  it('runs Download through Preparing to Saved without inventing a percentage', async () => {
    let settle: (() => void) | undefined
    const pending = new Promise<void>((resolve) => {
      settle = resolve
    })
    render(
      <OutputHeader
        variant="dock"
        tab="preview"
        onTabChange={() => {}}
        onDownload={() => pending}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Download' }))
    const preparing = await screen.findByRole('button', { name: 'Preparing' })
    expect(preparing.style.getPropertyValue('--jbk-button-progress')).toBe('')

    settle?.()
    expect(await screen.findByRole('button', { name: 'Saved' })).toBeInTheDocument()
  })
})
