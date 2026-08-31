import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ValueRow } from './ValueRow.js'

afterEach(cleanup)

const URL_VALUE = 'cdn.jobik.dev/p/221/cover.png'

describe('ValueRow', () => {
  it('shows the value and copies on press', async () => {
    const onCopy = vi.fn()
    render(<ValueRow value={URL_VALUE} onCopy={onCopy} />)
    expect(screen.getByText(URL_VALUE)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(onCopy).toHaveBeenCalledTimes(1)
  })

  it('keeps showing the value while the write is still going', () => {
    render(<ValueRow value={URL_VALUE} state="busy" />)
    expect(screen.getByText(URL_VALUE)).toBeInTheDocument()
  })

  /**
   * The two states where `3A` replaces the text rather than only the chrome. The defaults are the
   * artboard's own strings, so a caller that says nothing still says the right thing.
   */
  it('replaces the value once the clipboard has it, or once the browser refused', () => {
    const { rerender } = render(<ValueRow value={URL_VALUE} state="ok" />)
    expect(screen.getByText('copied to clipboard')).toBeInTheDocument()
    expect(screen.queryByText(URL_VALUE)).not.toBeInTheDocument()

    rerender(<ValueRow value={URL_VALUE} state="failed" />)
    expect(screen.getByText('clipboard blocked by the browser')).toBeInTheDocument()
  })

  it('drops the trailing action entirely when the browser has blocked the clipboard', () => {
    render(<ValueRow value={URL_VALUE} state="failed" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('lets a caller name the replacement text for a row that is not a URL', () => {
    render(<ValueRow value="sha256:9f2c" state="ok" copiedLabel="checksum copied" />)
    expect(screen.getByText('checksum copied')).toBeInTheDocument()
  })
})
