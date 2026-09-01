import { reatomComponent, useWrap } from '@reatom/react'
import { ModalShell } from '#modals/ModalShell/ModalShell.js'
import { type ProseSegment, ProseText } from '#modals/ProseText/ProseText.js'
import { useStudioModel } from '#model/context.js'
import { Button } from '#primitives/index.js'
import { Spinner } from '#primitives/Spinner/Spinner.js'
import s from './SwitchFlowModal.module.css'

/**
 * The two bodies artboard `3F` draws, and the only two. Each carries its own pair of actions,
 * because the pair *is* the body: the ghost gives something up and the accent primary does not.
 *
 * `model/flowSwitch.ts`'s `body` is a `Computed<SwitchFlowBody | undefined>`, so this shape is the
 * contract between that module and this dialog. It stays declared here, beside the component that
 * draws it, and `model/types.ts` imports it — the model owns the values, the design owns the shape.
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
 * ## It reads the model, and it owns its own open guard
 *
 * Every value the artboard draws already had a home: `FlowSwitchModel.body` is literally a
 * `Computed<SwitchFlowBody | undefined>` and carries the pair of answers with it,
 * `pendingFlowName` titles the dialog, `flows.descriptor` names the flow being left, and
 * `flowSwitch.stay` is the dismissal. So it takes no props at all, exactly as `CancelRunModal`
 * takes none.
 *
 * **The guard is here rather than in the caller.** `StudioApp` used to write
 * `body === undefined || pendingFlowName === undefined ? null : <SwitchFlowModal … />`, which put
 * the whole Studio body on `flowSwitch.body` — a computed that reads `run.elapsedMs`, so it moves
 * ten times a second for the length of a run. RTM-C01 is what makes moving it pay: the reads below
 * the guards never happen while the dialog is shut, so a closed `SwitchFlowModal` subscribes to
 * `body` alone and the run clock reaches this component only while it is on screen.
 *
 * Reading `body` is also what arms `3F`'s self-answering switch: `body` and `pendingFlowName` both
 * read `pendingFlowId`, and the reaction that answers the question once nothing is at risk hangs
 * off that atom's connect hook — see `model/flowSwitch.ts`. This component reads `body`
 * unconditionally, before any guard, so the arming cannot be lost.
 */
export const SwitchFlowModal = reatomComponent(function SwitchFlowModal() {
  const { flows, flowSwitch } = useStudioModel()

  /**
   * RTM-C02: the three presses reach Reatom actions from a DOM event, outside the frame this
   * render is in, so each is wrapped into the model's frame. They are declared above the guards
   * because they are hooks, and a hook after a conditional return is a React error.
   *
   * The two footer handlers read `flowSwitch.body()` **at the press** rather than closing over the
   * body this render drew, and that keeps the pairing where `model/flowSwitch.ts` put it: the
   * ghost and the primary differ per arm precisely so a surface cannot pair `Cancel and switch`
   * with `Save and switch`. Re-reading also means a body that changed under the dialog — a run
   * settling while it stands — answers with the pair currently on screen.
   */
  const pressGhost = useWrap(() => {
    const current = flowSwitch.body()
    if (current === undefined) return
    if (current.kind === 'running') current.onCancelAndSwitch?.()
    else current.onDiscardChanges?.()
  }, 'SwitchFlowModal.ghost')

  const pressPrimary = useWrap(() => {
    const current = flowSwitch.body()
    if (current === undefined) return
    if (current.kind === 'running') current.onSwitchAndKeepRunning?.()
    else current.onSaveAndSwitch?.()
  }, 'SwitchFlowModal.primary')

  const stay = useWrap(() => {
    flowSwitch.stay()
  }, 'SwitchFlowModal.stay')

  // RTM-C01: the guards first, and every value the body draws only after them.
  const body = flowSwitch.body()
  if (body === undefined) return null
  const targetFlowName = flowSwitch.pendingFlowName()
  if (targetFlowName === undefined) return null

  const currentFlowName = flows.descriptor()?.name ?? flows.flowId() ?? ''
  const title = `Switch to ${targetFlowName}?`

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
          currentFlowName,
          runNumber: body.runNumber,
        })
      : switchFlowUnsavedMessage({
          currentFlowName,
          documentFile: body.documentFile,
          targetFlowName,
        })

  const actions =
    body.kind === 'running' ? (
      <>
        <Button variant="quiet" size="modal" onClick={pressGhost}>
          Cancel and switch
        </Button>
        <Button variant="accent" size="modal" onClick={pressPrimary}>
          Switch and keep running
        </Button>
      </>
    ) : (
      <>
        <Button variant="quiet" size="modal" onClick={pressGhost}>
          Discard changes
        </Button>
        <Button variant="accent" size="modal" onClick={pressPrimary}>
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
      hint={`esc stays in ${currentFlowName}`}
      actions={actions}
      onDismiss={stay}
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
