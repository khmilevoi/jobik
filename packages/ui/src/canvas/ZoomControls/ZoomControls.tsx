import { Panel, useReactFlow, useViewport } from '@xyflow/react'
import { cx } from '../../cx.js'
import s from './ZoomControls.module.css'

export function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`
}

/** `### Layout and metrics`: two 26px squares and a 100% readout, bottom-left. */
export function ZoomControls() {
  const { zoomIn, zoomOut } = useReactFlow()
  const { zoom } = useViewport()

  return (
    <Panel position="bottom-left" data-testid="zoom-controls" className={s.panel}>
      <button
        type="button"
        aria-label="Zoom out"
        onClick={() => zoomOut()}
        className={cx(s.chrome, s.button)}
      >
        −
      </button>
      <button
        type="button"
        aria-label="Zoom in"
        onClick={() => zoomIn()}
        className={cx(s.chrome, s.button)}
      >
        +
      </button>
      <div data-testid="zoom-readout" className={cx(s.chrome, s.readout)}>
        {formatZoom(zoom)}
      </div>
    </Panel>
  )
}
