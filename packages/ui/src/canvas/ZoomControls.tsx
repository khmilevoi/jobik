import { Panel, useReactFlow, useViewport } from '@xyflow/react'
import type { CSSProperties } from 'react'
import { fontFamilies, px, radii, surfaces, textColors } from '../tokens.js'
import { canvasColors, canvasMetrics } from './canvasTokens.js'

export function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`
}

const chrome: CSSProperties = {
  height: px(canvasMetrics.zoomButtonSize),
  border: `1px solid ${canvasColors.zoomControlBorder}`,
  borderRadius: px(radii.control),
  background: surfaces.inputWell,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: textColors.chevron,
  lineHeight: 1,
}

const button: CSSProperties = {
  ...chrome,
  width: px(canvasMetrics.zoomButtonSize),
  fontFamily: fontFamilies.ui,
  fontSize: px(13),
}

/** `### Layout and metrics`: two 26px squares and a 100% readout, bottom-left. */
export function ZoomControls() {
  const { zoomIn, zoomOut } = useReactFlow()
  const { zoom } = useViewport()

  return (
    <Panel
      position="bottom-left"
      data-testid="zoom-controls"
      style={{
        margin: `0 0 ${px(canvasMetrics.zoomControlsInset.bottom)} ${px(
          canvasMetrics.zoomControlsInset.left,
        )}`,
        display: 'flex',
        alignItems: 'center',
        gap: px(6),
      }}
    >
      <button type="button" aria-label="Zoom out" onClick={() => zoomOut()} style={button}>
        −
      </button>
      <button type="button" aria-label="Zoom in" onClick={() => zoomIn()} style={button}>
        +
      </button>
      <div
        data-testid="zoom-readout"
        style={{
          ...chrome,
          padding: `0 ${px(9)}`,
          fontFamily: fontFamilies.mono,
          fontSize: px(10),
        }}
      >
        {formatZoom(zoom)}
      </div>
    </Panel>
  )
}
