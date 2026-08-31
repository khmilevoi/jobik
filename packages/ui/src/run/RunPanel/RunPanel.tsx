import { cx } from '../../cx.js'
import { RunCompletedView } from '../RunCompletedView/RunCompletedView.js'
import { RunFailedView } from '../RunFailedView/RunFailedView.js'
import { RunIdleView } from '../RunIdleView/RunIdleView.js'
import { RunRunningView } from '../RunRunningView/RunRunningView.js'
import { RunStateHeader } from '../RunStateHeader/RunStateHeader.js'
import type { RunPanelState } from '../types.js'
import s from './RunPanel.module.css'

export interface RunPanelProps {
  readonly state: RunPanelState
}

/**
 * The run panel's body, in whichever of the four states its props describe.
 *
 * Returns a FRAGMENT on purpose. `RunDock` supplies the `16px 14px` padding and the `16px` gap
 * between blocks, and its own doc comment forbids a child restating them; a wrapper here would
 * introduce a second gap context and break that contract. It also renders no header: `RunDock`
 * draws the one header, run number included (its `runMeta` prop, closeout finding 8-A).
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
  readonly className?: string
}

/**
 * The panel's four states and the frame each one takes, spelled out so `satisfies` catches a fifth
 * and `cssModuleUsage.test.ts` can see every read. `undefined` means the state adds nothing to
 * `.card` — the artboards draw one tinted frame and one plain one.
 */
const cardByKind = {
  idle: undefined,
  running: undefined,
  completed: undefined,
  failed: s.cardFailed,
} satisfies Record<RunPanelState['kind'], string | undefined>

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
  return (
    <div
      data-testid="run-panel-card"
      className={cx(s.card, cardByKind[props.state.kind], props.className)}
    >
      <RunStateHeader state={props.state} entryNodeId={props.entryNodeId} />
      <div data-testid="run-panel-card-body" className={s.cardBody}>
        <RunPanel state={props.state} />
      </div>
    </div>
  )
}
