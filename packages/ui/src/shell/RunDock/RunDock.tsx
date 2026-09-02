import { reatomComponent } from '@reatom/react'
import type { ReactNode } from 'react'
import { cx } from '#cx.js'
import { Spinner } from '#primitives/Spinner/Spinner.js'
import { PanelHeader } from '#shell/PanelHeader/PanelHeader.js'
import s from './RunDock.module.css'

/** `Run panel — states`: the failed card's meta is its own `#6d5f5c` (design 801); the running and
 *  completed ones are the neutral `#5d656c` (777, 838). */
export type RunDockMetaTone = 'normal' | 'failed'

/**
 * The run states the dock header names on its left, from `2A` (`● Completed`) and
 * `Run panel — states` (the `Running` ring, `Run failed`).
 *
 * **`running` is a member, and F-C4's earlier ruling that "no artboard settles it" was wrong.**
 * `2A:1191` — the newest artboard, and the only one that draws a *settled* dock inside the live
 * shell — heads it `● Completed` / `#221 · 2.4s`: a state word and a meta, never `Run <entry>`.
 * `Studio — run in progress` (1818-1822) is the only `Run <entry>` header anywhere, it is older,
 * and it shows a *different state of the same header* rather than a rival design for it. Reading
 * the two as irreconcilable produced a header that changed shape mid-run — `Run start1` while the
 * stream ran, a state word the instant it stopped — which is a third behaviour neither artboard
 * draws. So the header takes a state word for the whole run, and `Run panel — states` (2009-2011)
 * is what the running one looks like: the 9px `jspin` ring, `Running`, `#219` opposite.
 *
 * **`cancelled` is here because the engine settles three ways and this header used to name two
 * (R7).** No artboard draws it — the design speaks about cancelling in exactly one place, `3C`'s
 * Cancel run dialog, and that dialog treats it as a deliberate act rather than a fault. So the
 * treatment is the one the dialog implies and `RunToast` already uses: the muted text tone, the
 * word `cancelled`, and none of the failed header's warm wash. Saying `Run failed` over a
 * `RunCancelledError` was the app contradicting itself inside one header.
 */
export type RunDockStatus = 'running' | 'completed' | 'failed' | 'cancelled'

export interface RunDockProps {
  readonly entryNodeId: string
  readonly onCollapse: () => void
  /**
   * The run number, once a run exists: `#219` while in flight (`Studio — run in progress`, design
   * 592) and `#220 · 0.8s` / `#221 · 2.4s` once settled (`Run panel — states`, 801 and 838; `2A`).
   *
   * While it is set the 22×22 chevron gives way to it and the header's asymmetric
   * `0 10px 0 14px` — which exists only to seat that button — becomes symmetric `0 14px`. That
   * closes closeout finding 8-A: `RunStateHeader` drew all three of these headers for the
   * standalone card and nothing ever mounted it in the dock, so the run number reached no run
   * state at all.
   */
  readonly runMeta?: string
  readonly runMetaTone?: RunDockMetaTone
  /**
   * The run's state, from the moment one exists. `2A` heads the dock `● Completed` / `#221 · 2.4s`
   * — the header carries the run's *state*, not only its number — and `Run panel — states` gives
   * the running and failed forms the same shape, the failed one on a tinted bar. Left unset, the
   * header keeps `Run <entry>` on its left, which is what `Studio — default` draws and what the
   * idle dock is.
   */
  readonly runStatus?: RunDockStatus
  /**
   * The run panel's contents. P11 owns everything in here; the body's `16px 14px` padding and its
   * `16px` inter-block gap belong to this shell and must not be restated by the children. This is
   * also still the dock's ONE header: a child must not draw a second one.
   */
  readonly children?: ReactNode
}

/** Spelled out, not indexed by a computed key — see `cssModuleUsage.test.ts`. */
const metaTone = {
  normal: s.metaNormal,
  failed: s.metaFailed,
} satisfies Record<RunDockMetaTone, string>

/** The tables the state header reads, each written out so a new state is a type error. */
const statusTitle = {
  running: 'Running',
  completed: 'Completed',
  failed: 'Run failed',
  cancelled: 'Run cancelled',
} satisfies Record<RunDockStatus, string>

/**
 * Only the settled three. `running` is absent because it takes the ring instead of a dot
 * (`Run panel — states`, 2009), and `Exclude` is what makes that a table the compiler still
 * completes rather than a case somebody can forget.
 */
const statusDotTone = {
  completed: s.statusDotOk,
  failed: s.statusDotFailed,
  cancelled: s.statusDotCancelled,
} satisfies Record<Exclude<RunDockStatus, 'running'>, string>

/**
 * A `reatomComponent` with an unchanged prop API. `runMeta`, `runMetaTone` and `runStatus` all have
 * a model home in `RunPanelModel`, but `Studio` is what fills them and `Studio` renders with no
 * model at all; reading them here would make the artboard's shell unrenderable on its own.
 */
export const RunDock = reatomComponent(function RunDock(props: RunDockProps) {
  // `Studio — default` (264–273): the idle dock's left half carries the flow's entry point. Once a
  // run exists `runStatus` replaces it with the run's own state word — see `RunDockStatus`.
  const title = (
    <div className={s.title}>
      <div className={s.titleLabel}>Run</div>
      <div className={s.titleEntry}>{props.entryNodeId}</div>
    </div>
  )

  const status = props.runStatus
  const failed = status === 'failed'

  // `2A` (`● Completed`) and `Run panel — states` (795–801): a 6×6 square dot plus the state word,
  // and (2009) the 9px ring in the dot's place while the run streams.
  const leading =
    status === undefined ? (
      title
    ) : (
      <div className={s.title}>
        {status === 'running' ? (
          <Spinner size={9} track="wide" data-testid="studio-dock-status-spinner" />
        ) : (
          <div
            data-testid="studio-dock-status-dot"
            className={cx(s.statusDot, statusDotTone[status])}
          />
        )}
        <div data-testid="studio-dock-status" className={cx(s.titleLabel, failed && s.titleFailed)}>
          {statusTitle[status]}
        </div>
      </div>
    )

  const settled = props.runMeta !== undefined || status !== undefined

  return (
    <div data-testid="studio-dock" className={s.dock}>
      {settled ? (
        // design 586–593 shows no collapse control in a dock that reports a run.
        <div data-testid="studio-dock-header" className={cx(s.header, failed && s.headerFailed)}>
          {leading}
          {props.runMeta === undefined ? null : (
            <div
              data-testid="studio-dock-run-meta"
              className={cx(s.meta, metaTone[props.runMetaTone ?? 'normal'])}
            >
              {props.runMeta}
            </div>
          )}
        </div>
      ) : (
        <PanelHeader
          data-testid="studio-dock-header"
          chevron="right"
          collapseLabel="Collapse run panel"
          onCollapse={props.onCollapse}
        >
          {title}
        </PanelHeader>
      )}

      <div data-testid="studio-dock-body" className={s.body}>
        {props.children}
      </div>
    </div>
  )
}, 'RunDock')
