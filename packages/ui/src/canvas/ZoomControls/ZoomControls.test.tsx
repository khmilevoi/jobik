import { cleanup, render, screen } from '@testing-library/react'
import { ReactFlow } from '@xyflow/react'
import { afterEach, describe, expect, it } from 'vitest'
import { formatZoom, ZoomControls } from './ZoomControls.js'

afterEach(cleanup)

function renderControls() {
  return render(
    <div style={{ width: 800, height: 600 }}>
      <ReactFlow nodes={[]} edges={[]} proOptions={{ hideAttribution: true }}>
        <ZoomControls />
      </ReactFlow>
    </div>,
  )
}

describe('formatZoom', () => {
  it('renders the viewport zoom as a whole percentage', () => {
    expect(formatZoom(1)).toBe('100%')
    expect(formatZoom(0.755)).toBe('76%')
    expect(formatZoom(2)).toBe('200%')
  })
})

describe('ZoomControls', () => {
  it('offers a zoom out and a zoom in button, labelled for a screen reader', async () => {
    renderControls()
    expect(await screen.findByRole('button', { name: 'Zoom out' })).toHaveTextContent('−')
    expect(screen.getByRole('button', { name: 'Zoom in' })).toHaveTextContent('+')
  })

  it('reads the viewport zoom back at 100% by default', async () => {
    renderControls()
    expect(await screen.findByTestId('zoom-readout')).toHaveTextContent('100%')
  })
})
