import { reatomComponent } from '@reatom/react'
import { ModalShell } from '#modals/ModalShell/ModalShell.js'
import { type ProseSegment, ProseText } from '#modals/ProseText/ProseText.js'
import { Button } from '#primitives/index.js'
import { Spinner } from '#primitives/Spinner/Spinner.js'
import s from './SwitchFlowModal.module.css'

/**
 * The two bodies artboard `3F` draws, and the only two. Each carries its own pair of actions,
 * because the pair *is* the body: the ghost gives something up and the accent primary does not.
 */
export type SwitchFlowBody =
  | {
      readonly kind: 'unsaved'
      /** The file the draft is not in yet — `flow.jobik.json`, the top bar's own badge. */
      readonly documentFile: string
      /** The right-hand read-out: `4 unsaved changes`. */
      readonly unsavedChanges: number
      /** The ghost. Closes the draft; a discarded draft cannot be recovered. */
      readonly onDiscardChanges?: () => void
      /** The accent primary. Writes the draft first, and switches only if that write lands. */
      readonly onSaveAndSwitch?: () => void
    }
  | {
      readonly kind: 'running'
      readonly runNumber: number
      /** Elapsed time, already formatted to one decimal with a bare `s` — e.g. `1.3s`. */
      readonly elapsed: string
      /** The node still working, set in mono at the head of the sentence — e.g. `render`. */
      readonly nodeId: string
      /** The ghost. Stops the run on the server before leaving. */
      readonly onCancelAndSwitch?: () => void
      /** The accent primary. The run keeps going and its report still lands in history. */
      readonly onSwitchAndKeepRunning?: () => void
    }

export interface SwitchFlowModalProps {
  /** The flow being left — both mono runs in the body and the `esc` hint. */
  readonly currentFlowName: string
  /** The flow that was clicked. `digest` titles the dialog `Switch to digest?`. */
  readonly targetFlowName: string
  readonly body: SwitchFlowBody
  /**
   * `esc` lands here, and so does any dismissal the caller wires. A backdrop click does **not**:
   * like `Cancel run`, this is a destructive dialog.
   */
  readonly onDismiss: () => void
}

/** `3F`, unsaved body, verbatim, with the three identifiers substituted at their mono runs. */
export function switchFlowUnsavedMessage(args: {
  currentFlowName: string
  documentFile: string
  targetFlowName: string
}): readonly ProseSegment[] {
  return [
    { text: args.currentFlowName, mono: true },
    { text: ' has edits that are not in ' },
    { text: args.documentFile, mono: true },
    { text: ' yet. Opening ' },
    { text: args.targetFlowName, mono: true },
    { text: ' closes the draft, and a discarded draft cannot be recovered.' },
  ]
}

/** `3F`, run body, verbatim. The run number is mono with its `#`, as the artboard sets it. */
export function switchFlowRunningMessage(args: {
  nodeId: string
  currentFlowName: string
  runNumber: number
}): readonly ProseSegment[] {
  return [
    { text: args.nodeId, mono: true },
    { text: ' keeps running on the server once ' },
    { text: args.currentFlowName, mono: true },
    { text: ' closes, and run ' },
    { text: `#${args.runNumber}`, mono: true },
    { text: ' lands in its history either way. Cancel it here if it should stop.' },
  ]
}

/** `4 unsaved changes`. Pluralised, because a draft holding one edit is the common case. */
export function switchFlowUnsavedMeta(unsavedChanges: number): string {
  return `${unsavedChanges} unsaved ${unsavedChanges === 1 ? 'change' : 'changes'}`
}

/**
 * `run #221 · 1.3s`. Spelled out here rather than borrowed from `run/format.ts`'s `formatRunMeta`,
 * which is the dock's own `#221 · 1.3s` — the artboard prefixes this one with `run `, and `modals/`
 * does not depend on `run/`.
 */
export function switchFlowRunningMeta(runNumber: number, elapsed: string): string {
  return `run #${runNumber} · ${elapsed}`
}

/**
 * Artboard `3F` — **Switch flow**, `520px`. One modal with two bodies.
 *
 * Structurally it is `CancelRunModal` one width up, and for the same reason: switching away is a
 * decision that can lose something, so it is headerless — no band, no `×`, the title in the body's
 * first row beside its status mark — and `destructive`, so a backdrop click does not dismiss it.
 *
 * **Two actions, never three.** Staying put is `esc`, and the footer hint says so, which is the
 * move `Cancel run` already makes with `esc keeps running`. The rule tying the bodies together is
 * `3F` rule 02: *the accent primary is always the switch that loses nothing; the ghost beside it is
 * the switch that gives something up.* So `Save and switch` and `Switch and keep running` are the
 * primaries, and `Discard changes` and `Cancel and switch` are the ghosts.
 *
 * **Motion:** rule 04 — the spinner turns in the run body only, because the run has not stopped.
 * The unsaved body carries the top bar's own `--jbk-status-unsaved` dot and nothing moves.
 *
 * ## Why this one still takes props
 *
 * Every value it draws does have a model home — `FlowSwitchModel.body` is literally a
 * `Computed<SwitchFlowBody | undefined>`, `pendingFlowName` is the title, `flows.descriptor` names
 * the flow being left, and `stay` is the dismissal — so on the values alone it would convert.
 * What stops it is the published API: `packages/ui/src/index.ts` is append-only and names
 * `SwitchFlowModalProps` on an explicit export line of its own. A model-reading component takes no
 * props, which would leave that type with nothing to describe and that barrel line with nothing to
 * export, and neither the line nor the type may be removed.
 *
 * So `StudioApp` keeps reading `flowSwitch.body` and `flowSwitch.pendingFlowName` and handing them
 * over — which is also what keeps `3F`'s self-answering switch armed, since reading any of the
 * three units connects `pendingFlowId` (see `model/flowSwitch.ts`). Converting this dialog is a
 * decision about `@jobik/ui`'s surface, and it belongs to whoever may edit that barrel.
 */
export const SwitchFlowModal = reatomComponent(function SwitchFlowModal(
  props: SwitchFlowModalProps,
) {
  const { body } = props
  const title = `Switch to ${props.targetFlowName}?`

  const mark =
    body.kind === 'running' ? (
      <Spinner size={11} data-testid="switch-flow-spinner" />
    ) : (
      <div data-testid="switch-flow-dot" className={s.dot} />
    )

  const meta =
    body.kind === 'running'
      ? switchFlowRunningMeta(body.runNumber, body.elapsed)
      : switchFlowUnsavedMeta(body.unsavedChanges)

  const segments =
    body.kind === 'running'
      ? switchFlowRunningMessage({
          nodeId: body.nodeId,
          currentFlowName: props.currentFlowName,
          runNumber: body.runNumber,
        })
      : switchFlowUnsavedMessage({
          currentFlowName: props.currentFlowName,
          documentFile: body.documentFile,
          targetFlowName: props.targetFlowName,
        })

  const actions =
    body.kind === 'running' ? (
      <>
        <Button variant="quiet" size="modal" onClick={body.onCancelAndSwitch}>
          Cancel and switch
        </Button>
        <Button variant="accent" size="modal" onClick={body.onSwitchAndKeepRunning}>
          Switch and keep running
        </Button>
      </>
    ) : (
      <>
        <Button variant="quiet" size="modal" onClick={body.onDiscardChanges}>
          Discard changes
        </Button>
        <Button variant="accent" size="modal" onClick={body.onSaveAndSwitch}>
          Save and switch
        </Button>
      </>
    )

  return (
    <ModalShell
      data-testid="switch-flow-modal"
      title={title}
      width={520}
      bodyGap={9}
      destructive
      hint={`esc stays in ${props.currentFlowName}`}
      actions={actions}
      onDismiss={props.onDismiss}
    >
      <div className={s.titleRow}>
        {mark}
        <h2 className={s.title}>{title}</h2>
        <div className={s.spacer} />
        <div data-testid="switch-flow-meta" className={s.meta}>
          {meta}
        </div>
      </div>
      <ProseText
        data-testid="switch-flow-message"
        segments={segments}
        tone="lifted"
        className={s.message}
      />
    </ModalShell>
  )
}, 'SwitchFlowModal')
