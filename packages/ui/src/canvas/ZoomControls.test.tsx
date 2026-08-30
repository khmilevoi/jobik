import { cleanup, render, screen } from '@testing-library/react'
import { ReactFlow } from '@xyflow/react'
import { afterEach, describe, expect, it } from 'vitest'
import { surfaces, textColors } from '../tokens.js'
import { canvasColors } from './canvasTokens.js'
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
  it('sits 20px from the left and 16px from the bottom', async () => {
    renderControls()
    expect(await screen.findByTestId('zoom-controls')).toHaveStyle({ margin: '0 0 16px 20px' })
  })

  it('offers two 26px square buttons with the design chrome', async () => {
    renderControls()
    const out = await screen.findByRole('button', { name: 'Zoom out' })
    expect(out).toHaveTextContent('−')
    expect(out).toHaveStyle({
      width: '26px',
      height: '26px',
      border: `1px solid ${canvasColors.zoomControlBorder}`,
      borderRadius: '5px',
      background: surfaces.inputWell,
      fontSize: '13px',
      color: textColors.chevron,
    })
    const zoomIn = screen.getByRole('button', { name: 'Zoom in' })
    expect(zoomIn).toHaveTextContent('+')
  })

  it('reads the viewport zoom back at 100% by default', async () => {
    renderControls()
    const readout = await screen.findByTestId('zoom-readout')
    expect(readout).toHaveTextContent('100%')
    expect(readout).toHaveStyle({
      height: '26px',
      padding: '0 9px',
      fontSize: '10px',
      color: textColors.chevron,
    })
  })
})
