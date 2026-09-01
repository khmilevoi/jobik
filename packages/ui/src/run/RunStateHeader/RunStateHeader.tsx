import { reatomComponent } from '@reatom/react'
import { cx } from '#cx.js'
import { formatRunMeta } from '#run/format.js'
import { RunSpinner, RunStatusDot } from '#run/RunChrome/RunChrome.js'
import type { RunPanelState } from '#run/types.js'
import s from './RunStateHeader.module.css'

export interface RunStateHeaderProps {
  readonly state: RunPanelState
  /** The idle header reads `Run` plus this, in accent mono. */
  readonly entryNodeId: string
  readonly className?: string
}

type RunPanelKind = RunPanelState['kind']

/**
 * The panel's four states, spelled out, and the chrome each one adds to `.header`.
 *
 * `satisfies` makes a fifth state a type error rather than a state that silently renders untinted,
 * and every value is a literal `s.<name>` read, which is the only kind `cssModuleUsage.test.ts` can
 * see. `undefined` says the state adds nothing to the base rule — the artboards draw one tinted
 * header and one plain one, so inventing three empty classes would state a distinction the design
 * does not make.
 */
const headerByKind = {
  idle: undefined,
  running: undefined,
  completed: undefined,
  failed: s.headerFailed,
} satisfies Record<RunPanelKind, string | undefined>

/** The four titles, in the same shape, so the state machine reads as one table. */
const titleByKind = {
  idle: 'Run',
  running: 'Running',
  failed: 'Run failed',
  completed: 'Completed',
} satisfies Record<RunPanelKind, string>

/**
 * The 38px header of the `Run panel — states` cards: `Running` (lines 772–778), `Run failed` on the
 * error wash (796–802), `Completed` (831–837), and `Run start1` for the idle card
 * (`Studio — default`, 590–594).
 *
 * `RunPanel` does NOT render this. P4's `RunDock` already draws a header above the panel body and
 * nothing may stack a second one inside it; only `RunPanelCard` places it.
 *
 * Closeout finding 8-A closed the other half: the spec's "during and after a run the chevron is
 * replaced by the run number" now lives in `RunDock` itself (its `runMeta` prop), because the
 * docked header keeps the flow's entry point on its left (design 264–273, 586–591) rather than the
 * state title this component draws. The two are deliberately separate headers, not one hoisted.
 *
 * It stays prop-driven because it is not in `StudioApp`'s tree at all: `RunPanelCard` is its only
 * caller, and that card is the standalone artboard, mountable with no Studio model above it.
 */
export const RunStateHeader = reatomComponent(function RunStateHeader(props: RunStateHeaderProps) {
  const { state } = props
  const failed = state.kind === 'failed'

  const leading =
    state.kind === 'running' ? (
      <RunSpinner data-testid="run-state-header-spinner" />
    ) : state.kind === 'idle' ? null : (
      <RunStatusDot
        data-testid="run-state-header-dot"
        shape="square"
        tone={failed ? 'failed' : 'ok'}
      />
    )

  const meta =
    state.kind === 'idle'
      ? undefined
      : state.kind === 'running'
        ? formatRunMeta(state.runNumber)
        : formatRunMeta(state.runNumber, state.elapsed)

  return (
    <div
      data-testid="run-state-header"
      className={cx(s.header, headerByKind[state.kind], props.className)}
    >
      <div className={s.leading}>
        {leading}
        <div data-testid="run-state-header-title" className={s.title}>
          {titleByKind[state.kind]}
        </div>
        {state.kind !== 'idle' ? null : (
          <div data-testid="run-state-header-entry" className={s.entry}>
            {props.entryNodeId}
          </div>
        )}
      </div>
      {meta === undefined ? null : (
        <div data-testid="run-state-header-meta" className={s.meta}>
          {meta}
        </div>
      )}
    </div>
  )
}, 'RunStateHeader')
