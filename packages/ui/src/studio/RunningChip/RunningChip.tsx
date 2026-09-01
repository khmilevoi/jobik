import { reatomComponent } from '@reatom/react'
import { cx } from '#cx.js'
import { useStudioModel } from '#model/context.js'
import { Spinner } from '#primitives/Spinner/Spinner.js'
import { formatElapsed } from '#studio/format.js'
// The one component that reads `studioTokens.css`, so it is what puts the file in the module
// graph — the studio directory has no barrel to hang the import on.
import '../studioTokens.css'
import s from './RunningChip.module.css'

/**
 * `### Top bar`: during a run a chip takes the centre — spinner, `Running start1`, elapsed time and
 * an inline `Cancel`. P4 owns the slot (`TopBar`'s `runningChip: ReactNode`) and typed it as such;
 * no plan owned the chip's markup, so it is here.
 *
 * `SaveConflictChip` occupies the same slot when a save hit `FlowRevisionConflictError` (Ruling 6).
 * No artboard fixes a conflict treatment, so it invents no colour: every value in the stylesheet
 * is already a token — `--jbk-border-secondary-button` for its outline,
 * `--jbk-text-control-label` for its text, `--jbk-status-unsaved` for its dot, the same `#8a7d4a`
 * the unsaved indicator uses, because a conflict *is* an unsaved state.
 *
 * The spinner draws the same ring and label as the run panel's own (`--jbk-accent-spinner-track`,
 * `--jbk-text-action-label`), which is what this file used to import from `runPanelColors`. Both
 * are shared tokens in `tokens.css` rather than run-panel ones: a custom property exists only
 * while its stylesheet is on the page, and this chip must never need a `run/` component mounted.
 */

export interface RunningChipProps {
  readonly startId: string
  readonly onCancel?: () => void
  readonly className?: string
}

/**
 * **The run clock is read here, and this is the only component in the Studio that reads it.**
 *
 * It used to arrive as an already-formatted `elapsed` prop, which meant `StudioAppBody` — the
 * component that renders the canvas, both sidebars, the run dock and the output dock — called
 * `run.elapsedMs()` in its own body purely to feed these four characters. `elapsedMs` ticks every
 * 100ms for the length of a run, so the whole shell re-rendered ten times a second while a run
 * streamed, and the two `useMemo`s in that file exist only because it did.
 *
 * Reading the atom inside the chip is what stops the tick here: `reatomComponent` re-renders the
 * one component whose read was invalidated and nothing above it, so the clock now reaches a single
 * 100 × 22 element. `RunningChip.test.tsx` counts that with two `<Profiler>`s rather than asserting
 * it by inspection.
 *
 * `startId` and `onCancel` stay props deliberately. `StudioAppBody` already reads `running` and
 * `startId` to decide whether this chip exists at all — neither moves on a clock — so taking them
 * off the model would buy nothing and would tie the chip to a `RunModel` where it currently only
 * needs the number.
 */
export const RunningChip = reatomComponent(function RunningChip(props: RunningChipProps) {
  const elapsed = formatElapsed(useStudioModel().run.elapsedMs())

  return (
    <div data-testid="studio-running-chip" className={cx(s.chip, s.running, props.className)}>
      <Spinner size={11} data-testid="studio-running-spinner" />
      <div className={s.runningLabel}>
        Running{' '}
        <span data-testid="studio-running-start" className={s.startId}>
          {props.startId}
        </span>
      </div>
      <div data-testid="studio-running-elapsed" className={s.elapsed}>
        {elapsed}
      </div>
      <button
        type="button"
        data-testid="studio-running-cancel"
        onClick={props.onCancel}
        className={s.action}
      >
        Cancel
      </button>
    </div>
  )
}, 'RunningChip')

export interface SaveConflictChipProps {
  readonly onReload?: () => void
  readonly onCopyDraft?: () => void
  readonly className?: string
}

/**
 * `## UI and persistence`: *"If the file changed externally after load, save fails with
 * `FlowRevisionConflictError`; UI offers reload or copy-draft rather than overwriting."* There is
 * deliberately no third action — nothing here can overwrite the file.
 */
export function SaveConflictChip(props: SaveConflictChipProps) {
  return (
    <div data-testid="studio-conflict-chip" className={cx(s.chip, s.conflict, props.className)}>
      <div className={cx(s.dot, s.unsavedDot)} />
      <div className={s.message}>This flow changed on disk</div>
      <button
        type="button"
        data-testid="studio-conflict-reload"
        onClick={props.onReload}
        className={s.action}
      >
        Reload
      </button>
      <button
        type="button"
        data-testid="studio-conflict-copy"
        onClick={props.onCopyDraft}
        className={s.action}
      >
        Copy draft
      </button>
    </div>
  )
}

export interface SaveErrorChipProps {
  /** The server's own words — `WireErrorPayload.message`, rendered exactly as it arrived. */
  readonly message: string
  readonly className?: string
}

/**
 * R36: every non-409 save failure — a 500, a `FlowWriteError`, a transport failure — used to
 * produce `saveState.kind === 'error'` and render nothing, so Save silently did nothing visible and
 * the user believed the file was written. `## Verification` names save failures explicitly.
 *
 * No artboard draws a failed-save treatment (checked against `Jobik Studio.dc.html`), so this
 * invents no colour and no new layout: it reuses `SaveConflictChip`'s exact chrome above — a
 * conflict IS an unsaved state, and so is this — and swaps only the dot colour, to
 * `--jbk-status-failed` (already in `tokens.ts`, the same tone the run panel's own failed state
 * uses) so a failed save reads as a failure rather than merely unsaved.
 */
export function SaveErrorChip(props: SaveErrorChipProps) {
  return (
    <div data-testid="studio-save-error-chip" className={cx(s.chip, s.saveError, props.className)}>
      <div className={cx(s.dot, s.failedDot)} />
      <div data-testid="studio-save-error-message" className={s.message}>
        {props.message}
      </div>
    </div>
  )
}
