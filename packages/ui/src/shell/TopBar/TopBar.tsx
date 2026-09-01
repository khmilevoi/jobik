import { reatomComponent } from '@reatom/react'
import type { ReactNode } from 'react'
import { cx } from '#cx.js'
import { Badge, Button, ValidateButton } from '#primitives/index.js'
import s from './TopBar.module.css'

/**
 * `3D` — what the last check said, as the top bar sees it. The count travels with the invalid
 * state and nowhere else, so the button can never print a number nobody supplied.
 */
export type TopBarValidateState =
  | { readonly state: 'idle' | 'checking' | 'valid' }
  | { readonly state: 'invalid'; readonly errorCount: number }

export interface TopBarProps {
  readonly flowName: string
  /**
   * The mono file badge, e.g. `flow.ts`. Hidden while the bar is compact, and **absent when no
   * file name is known** — the badge is dropped rather than filled with a guess. Every artboard
   * that draws it draws a real name; none draws an empty badge, and `panels collapsed` is the
   * design's own picture of the bar with no badge at all.
   */
  readonly flowFile?: string
  readonly dirty: boolean
  /** Dims and disables `Validate` and `Save`, and hides the save state — see below. */
  readonly running?: boolean
  /**
   * The run affordance, present while the run dock is **open**.
   *
   * `2A` is the newer reading and it draws the `Run start1` + accent `Run` pill in the bar with the
   * dock expanded, beside the `flow.ts` badge and `Saved`. That is why this is a slot of its own
   * rather than `dockedRight`: a docked panel control means the panel is gone and the bar goes
   * compact, whereas this one only tightens the bar's gap to `14px`.
   */
  readonly runControl?: ReactNode
  /** The running pill — spinner, `Running start1`, elapsed, `Cancel`. `studio/RunningChip` fills it. */
  readonly runningChip?: ReactNode
  /** The docked `Flows & nodes` control, present only while the left panel is collapsed. */
  readonly dockedLeft?: ReactNode
  /** The docked `Run <entry>` control, present only while the right dock is collapsed. */
  readonly dockedRight?: ReactNode
  /**
   * `3D` — the Validate control's cell. Absent is `idle`, which is what every artboard but `3D`
   * draws.
   */
  readonly validate?: TopBarValidateState
  readonly onValidate?: () => void
  /** `3D` — the invalid cell's `report` sub-chip opens the validation report. */
  readonly onOpenReport?: () => void
  readonly onSave?: () => void
}

/**
 * A `reatomComponent` with an unchanged prop API. Every cell it draws — the flow name, the save
 * state, the validate cell, the run pill — is a value `Studio` was handed, and `Studio` is the
 * artboard's shell: it renders with fixture defaults, no model and no provider at all, which is
 * what `Studio.test.tsx` drives. A child that required a `StudioModelProvider` would end that.
 */
export const TopBar = reatomComponent(function TopBar(props: TopBarProps) {
  const { dockedLeft, dockedRight, runControl, runningChip, running = false } = props
  const validate: TopBarValidateState = props.validate ?? { state: 'idle' }
  const compact = dockedLeft !== undefined || dockedRight !== undefined || runningChip !== undefined
  // `gap:16px` in `Studio — default` alone; `14px` in `2A`, `panels collapsed` and
  // `run in progress` — i.e. the moment anything joins the bar beyond the plain identity row.
  const dense = compact || runControl !== undefined

  /**
   * `Saved` (dot `#6f9c82`) and `Unsaved changes` (dot `#8a7d4a`) are both fixed — `2A` shows the
   * first, `Studio — default` the second, `panels collapsed` the compact `Unsaved`.
   * `Studio — run in progress` shows **no** save state at all, which is what `running` says here.
   *
   * The clean state keeps its own `data-testid`: `studio-dirty` still means *unsaved*, so the
   * assertions built on its absence keep meaning what they meant.
   */
  const saveState = running ? null : props.dirty ? (
    <div data-testid="studio-dirty" className={cx(s.saveState, !dense && s.saveStateInset)}>
      <div data-testid="studio-dirty-dot" className={cx(s.saveStateDot, s.dotUnsaved)} />
      <div className={s.saveStateLabel}>{compact ? 'Unsaved' : 'Unsaved changes'}</div>
    </div>
  ) : (
    <div data-testid="studio-saved" className={cx(s.saveState, !dense && s.saveStateInset)}>
      <div data-testid="studio-saved-dot" className={cx(s.saveStateDot, s.dotSaved)} />
      <div className={s.saveStateLabel}>Saved</div>
    </div>
  )

  /**
   * No file name, no badge. The wire carries the name from the flow descriptor, and there is no
   * frame in which a name is merely late rather than genuinely unknown — so an empty badge and a
   * stand-in name are both worse than the element not being there.
   */
  const fileBadge =
    props.flowFile === undefined ? null : (
      <Badge data-testid="studio-flow-file">{props.flowFile}</Badge>
    )

  return (
    <div data-testid="studio-top-bar" className={cx(s.bar, dense && s.barDense)}>
      <div className={s.wordmarkRow}>
        <div data-testid="studio-wordmark-square" className={s.wordmarkSquare} />
        <div className={s.wordmarkText}>jobik</div>
      </div>

      <div className={s.divider} />

      {dockedLeft}

      <div data-testid="studio-top-bar-identity" className={s.flowNameRow}>
        <div className={s.flowName}>{props.flowName}</div>
        {compact ? saveState : fileBadge}
      </div>

      {compact ? null : saveState}

      <div className={s.spacer} />

      <div data-testid="studio-top-bar-actions" className={s.actions}>
        {runControl}
        {runningChip}
        {dockedRight}
        {/*
          `3D` replaces the plain ghost button with the four-cell control. The two are written out
          rather than spread, because the count is part of the invalid cell's type and a spread of
          the union would let a caller reach the invalid cell without one.
        */}
        {validate.state === 'invalid' ? (
          <ValidateButton
            data-testid="studio-validate"
            state="invalid"
            errorCount={validate.errorCount}
            onValidate={props.onValidate}
            onOpenReport={props.onOpenReport}
            dimmed={running}
          />
        ) : (
          <ValidateButton
            data-testid="studio-validate"
            state={validate.state}
            onValidate={props.onValidate}
            onOpenReport={props.onOpenReport}
            dimmed={running}
          />
        )}
        <Button variant="outlined" size="lg" onClick={props.onSave} dimmed={running}>
          Save
        </Button>
      </div>
    </div>
  )
}, 'TopBar')
