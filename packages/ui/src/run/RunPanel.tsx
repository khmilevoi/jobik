import { borders, px, radii, surfaces } from '../tokens.js'
import { RunCompletedView } from './RunCompletedView.js'
import { RunFailedView } from './RunFailedView.js'
import { RunIdleView } from './RunIdleView.js'
import { RunRunningView } from './RunRunningView.js'
import { RunStateHeader } from './RunStateHeader.js'
import { runPanelColors, runPanelMetrics } from './runPanelTokens.js'
import type { RunPanelState } from './types.js'

export interface RunPanelProps {
  readonly state: RunPanelState
}

/**
 * The run panel's body, in whichever of the four states its props describe.
 *
 * Returns a FRAGMENT on purpose. `RunDock` supplies the `16px 14px` padding and the `16px` gap
 * between blocks, and its own doc comment forbids a child restating them; a wrapper here would
 * introduce a second gap context and break that contract. It also renders no header: `RunDock`
 * already draws one.
 */
export function RunPanel(props: RunPanelProps) {
  const { state } = props
  if (state.kind === 'idle') return <RunIdleView state={state} />
  if (state.kind === 'running') return <RunRunningView state={state} />
  if (state.kind === 'failed') return <RunFailedView state={state} />
  return <RunCompletedView state={state} />
}

export interface RunPanelCardProps {
  readonly state: RunPanelState
  readonly entryNodeId: string
}

/**
 * The isolated 320×430 card of the `Run panel — states` artboard (lines 771–866): the frame, the
 * state header, and a body carrying the card's own `16px 14px` padding and `14px` gap.
 *
 * That is exact for `idle`, `failed` and `completed`. For `running` the body instead shows the
 * docked union `RunRunningView` renders — plan line 2494, "the running state is the union of two
 * artboards" — not the card artboard's own compact mono 10.5px timings list (design lines
 * 779–793), which is why the 430px body scrolls in that state.
 *
 * Use this outside the dock. Inside it, pass `RunPanel` to `RunDock` instead — the dock supplies
 * both the header and the body.
 */
export function RunPanelCard(props: RunPanelCardProps) {
  const failed = props.state.kind === 'failed'
  return (
    <div
      data-testid="run-panel-card"
      style={{
        width: px(runPanelMetrics.cardWidth),
        height: px(runPanelMetrics.cardHeight),
        background: surfaces.panel,
        border: `1px solid ${failed ? runPanelColors.failedFrame : borders.frame}`,
        borderRadius: px(radii.panel),
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <RunStateHeader state={props.state} entryNodeId={props.entryNodeId} />
      <div
        data-testid="run-panel-card-body"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: runPanelMetrics.cardBodyPadding,
          display: 'flex',
          flexDirection: 'column',
          gap: px(runPanelMetrics.cardBodyGap),
        }}
      >
        <RunPanel state={props.state} />
      </div>
    </div>
  )
}
