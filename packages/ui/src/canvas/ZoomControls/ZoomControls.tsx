import { reatomComponent } from '@reatom/react'
import { Panel, useReactFlow, useViewport } from '@xyflow/react'
import { cx } from '#cx.js'
import s from './ZoomControls.module.css'

export function formatZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`
}

/**
 * `### Layout and metrics`: two 26px squares and a 100% readout, bottom-left.
 *
 * **The zoom stays in React Flow's store, and that is the right home for it.** It is the viewport's
 * own state — written by wheel, pinch and these two buttons, read back by every rendered node's
 * transform — not application state the Studio holds a view on. Mirroring it into an atom would
 * give the same number two owners and the canvas one more thing to keep in step. So this is wrapped
 * and its two hooks are left where they are.
 */
export const ZoomControls = reatomComponent(function ZoomControls() {
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
}, 'ZoomControls')
