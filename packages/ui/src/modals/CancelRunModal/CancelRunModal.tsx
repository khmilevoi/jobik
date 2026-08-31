import { ModalShell } from '#modals/ModalShell/ModalShell.js'
import { type ProseSegment, ProseText } from '#modals/ProseText/ProseText.js'
import { Button } from '#primitives/index.js'
import { Spinner } from '#primitives/Spinner/Spinner.js'
import s from './CancelRunModal.module.css'

export interface CancelRunModalProps {
  /** The run being confirmed. `219` titles the dialog `Cancel run #219?`. */
  readonly runNumber: number
  /** Elapsed time, already formatted to one decimal place with a bare `s` — e.g. `1.3s`. */
  readonly elapsed: string
  /** The node still working, set in mono twice in the body sentence — e.g. `render`. */
  readonly nodeId: string
  readonly onKeepRunning?: () => void
  readonly onCancelRun?: () => void
  /**
   * `esc` lands here, and so does the `Keep running` button's own handler if the caller wires it
   * that way. A backdrop click does **not**: this is the destructive dialog.
   */
  readonly onDismiss: () => void
}

/**
 * §5, verbatim, with the node identifier substituted at both mono runs.
 *
 * `07-copy.md` §4.5: *"`render` finishes writing its current frame, then the run stops. Completed
 * nodes stay cached, so a re-run resumes from `render`."*
 */
export function cancelRunMessage(nodeId: string): readonly ProseSegment[] {
  return [
    { text: nodeId, mono: true },
    {
      text: ' finishes writing its current frame, then the run stops. Completed nodes stay cached, so a re-run resumes from ',
    },
    { text: nodeId, mono: true },
    { text: '.' },
  ]
}

/**
 * `3C` Modal D — **Cancel run**, `400px`, the narrowest and the only destructive confirm.
 * `09-modals.md` §5.
 *
 * It is the design's only modal with **no header band and no `×`**: the title sits in the body's
 * first row, beside the spinner that is still turning because the run has not stopped yet. It is
 * also the only one a backdrop click must not dismiss — rule 02, *"clicking the backdrop closes
 * anything non-destructive"* — which is what `destructive` on the shell says.
 *
 * `esc` still dismisses, and the footer hint spells out why that is safe: **`esc keeps running`**
 * is the one place in the whole design where `esc` means something other than *cancel the thing in
 * front of you*.
 */
export function CancelRunModal(props: CancelRunModalProps) {
  const title = `Cancel run #${props.runNumber}?`

  const actions = (
    <>
      <Button variant="quiet" size="modal" onClick={props.onKeepRunning}>
        Keep running
      </Button>
      <Button variant="destructive" size="modal" onClick={props.onCancelRun}>
        Cancel run
      </Button>
    </>
  )

  return (
    <ModalShell
      data-testid="cancel-run-modal"
      title={title}
      width={400}
      bodyGap={9}
      destructive
      hint="esc keeps running"
      actions={actions}
      onDismiss={props.onDismiss}
    >
      <div className={s.titleRow}>
        <Spinner size={11} data-testid="cancel-run-spinner" />
        <h2 className={s.title}>{title}</h2>
        <div className={s.spacer} />
        <div data-testid="cancel-run-elapsed" className={s.elapsed}>
          {props.elapsed}
        </div>
      </div>
      <ProseText
        data-testid="cancel-run-message"
        segments={cancelRunMessage(props.nodeId)}
        tone="lifted"
        className={s.message}
      />
    </ModalShell>
  )
}
