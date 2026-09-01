import { reatomComponent } from '@reatom/react'
import { memo } from 'react'
import { cx } from '#cx.js'
import { useStudioModel } from '#model/context.js'
import { RunCompletedView } from '#run/RunCompletedView/RunCompletedView.js'
import { RunFailedView } from '#run/RunFailedView/RunFailedView.js'
import { RunIdleView } from '#run/RunIdleView/RunIdleView.js'
import { RunRunningView } from '#run/RunRunningView/RunRunningView.js'
import { RunStateHeader } from '#run/RunStateHeader/RunStateHeader.js'
import type { RunPanelState, RunPanelVariant } from '#run/types.js'
import s from './RunPanel.module.css'

export interface RunPanelBodyProps {
  readonly state: RunPanelState
  /**
   * Which running artboard the running state is drawn as — `dock` (the default) is `Studio — run in
   * progress`, `card` the `Run panel — states` card. Only that state reads it; the other three are
   * drawn the same way in both places.
   */
  readonly variant?: RunPanelVariant
}

/**
 * The run panel's body, in whichever of the four states the state it is GIVEN describes.
 *
 * This is the prop-driven half, and it is the one place the four-arm union is discriminated. It
 * exists separately from {@link RunPanel} because two callers want opposite things: the docked
 * panel reads its state from the model, while {@link RunPanelCard} — the standalone artboard card,
 * documented as the thing to use *outside* the dock — is handed one and must keep working with no
 * `StudioModelProvider` above it.
 *
 * Returns a FRAGMENT on purpose. `RunDock` supplies the `16px 14px` padding and the `16px` gap
 * between blocks, and its own doc comment forbids a child restating them; a wrapper here would
 * introduce a second gap context and break that contract. It also renders no header: `RunDock`
 * draws the one header, run number included (its `runMeta` prop, closeout finding 8-A).
 */
export const RunPanelBody = reatomComponent(function RunPanelBody(props: RunPanelBodyProps) {
  const { state } = props
  if (state.kind === 'idle') return <RunIdleView state={state} />
  if (state.kind === 'running') return <RunRunningView state={state} variant={props.variant} />
  if (state.kind === 'failed') return <RunFailedView state={state} />
  return <RunCompletedView state={state} />
}, 'RunPanelBody')

export interface RunPanelProps {
  /** Forwarded to {@link RunPanelBody}; only the running state reads it. */
  readonly variant?: RunPanelVariant
}

/**
 * The dock's body, reading the one state the model publishes for it.
 *
 * **This is the only component in `run/` that reads the model**, and that is deliberate rather than
 * economical. `RunPanelModel` publishes exactly one unit the panel draws — `state`, a four-arm
 * union — so one read discriminates it once and every view below keeps the arm it was already
 * written against. Splitting the read across the four views would buy four subscriptions to the
 * same computed, and would cost `RunPanelCard` the ability to draw a state it was handed.
 *
 * `undefined` means the model has nothing to draw yet — no descriptor, or no start selected — and
 * renders nothing. `RunDock` draws its header either way, so this is exactly the DOM the dock had
 * while `StudioApp` withheld the panel itself.
 *
 * **Memoised, and that is the perf fix reaching the view layer.** It takes no data props, so the
 * shallow compare always passes and a parent re-render can never reach it; only `state` changing
 * re-renders it. `StudioApp` still reads the run's clock for the running chip, so its own body
 * re-renders ten times a second for the length of a run — and none of those renders reaches the
 * panel, the log or the node rows any more.
 */
export const RunPanel = memo(
  reatomComponent(function RunPanel(props: RunPanelProps) {
    // RTM-C01: the model read sits after nothing, because there is no earlier guard to sit after —
    // but it is the only one, and the branch below returns before touching anything else.
    const state = useStudioModel().runPanel.state()
    if (state === undefined) return null
    return (
      <RunPanelBody
        state={state}
        {...(props.variant === undefined ? {} : { variant: props.variant })}
      />
    )
  }, 'RunPanel'),
)

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
 * It passes `variant="card"`, so the running state is the card's own — the 3px bar alone above the
 * compact mono 10.5px timings (design lines 779–793) — rather than the docked head row and 30px
 * rows `Studio — run in progress` draws.
 *
 * Use this outside the dock. Inside it, pass `RunPanel` to `RunDock` instead — the dock supplies
 * both the header and the body. Being usable outside the dock is also why this stays prop-driven:
 * it draws a state its caller holds, in a tree that may have no Studio model in it at all.
 */
export const RunPanelCard = reatomComponent(function RunPanelCard(props: RunPanelCardProps) {
  return (
    <div
      data-testid="run-panel-card"
      className={cx(s.card, cardByKind[props.state.kind], props.className)}
    >
      <RunStateHeader state={props.state} entryNodeId={props.entryNodeId} />
      <div data-testid="run-panel-card-body" className={s.cardBody}>
        <RunPanelBody state={props.state} variant="card" />
      </div>
    </div>
  )
}, 'RunPanelCard')
