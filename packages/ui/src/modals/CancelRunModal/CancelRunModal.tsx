import { reatomComponent, useAction } from '@reatom/react'
import { ModalShell } from '#modals/ModalShell/ModalShell.js'
import { useModalExit } from '#modals/modalExit.js'
import { type ProseSegment, ProseText } from '#modals/ProseText/ProseText.js'
import { useStudioModel } from '#model/context.js'
import { Button } from '#primitives/index.js'
import { Spinner } from '#primitives/Spinner/Spinner.js'
import { formatElapsed } from '#studio/format.js'
import s from './CancelRunModal.module.css'

/**
 * §5's sentence, with the node identifier substituted at both mono runs.
 *
 * **A deliberate departure from the design's copy**, which reads: *"`render` finishes writing its
 * current frame, then the run stops. Completed nodes stay cached, so a re-run resumes from
 * `render`."* Both halves of that promise are false in v1, and this dialog is the one place a user
 * is told what cancelling costs, so stating it wrongly is worse than departing from `07-copy.md`
 * §4.5.
 *
 * What the engine actually does, from `run/execute.ts`: the in-flight node is handed the run's
 * `AbortSignal`, and the run settles on `Promise.race([invoked, aborted])` — it does **not** wait
 * for that handler, whose later output and log lines are dropped. And there is no caching at all:
 * `DEFERRED.md` §3 records `cached` as an unreachable status, so every reachable node executes
 * again on a re-run. "Finishes writing its current frame" was also written for an image node and
 * says nothing about an arbitrary flow.
 */
export function cancelRunMessage(nodeId: string): readonly ProseSegment[] {
  return [
    { text: nodeId, mono: true },
    {
      text: ' is asked to stop and the run settles at once, without waiting for it. Nothing is kept, so a re-run starts from the beginning and executes ',
    },
    { text: nodeId, mono: true },
    { text: ' again.' },
  ]
}

/** Everything the dialog draws, read in one place so `4A`'s departure has a last frame to hold. */
interface CancelRunView {
  readonly title: string
  readonly elapsed: string
  readonly nodeId: string
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
 *
 * ## It reads the model, and it owns its own open guard
 *
 * The one dialog in this directory where every value the artboard draws already has a home:
 * `RunModel.cancelPrompt` is whether it stands, `session.runNumber` titles it, `elapsedMs` is the
 * clock in its top-right corner, `runningNodeId` — falling back to the selected start, which is
 * what the stream has not named a node yet means — is the identifier set in mono twice, and
 * `keepRunning` and `confirmCancel` are its two answers. Nothing had to be invented and nothing is
 * threaded through a prop, so it takes none.
 *
 * **The guard is here rather than in the caller, and that is the point of moving it.** `StudioApp`
 * used to write `run.cancelPrompt() && running && session !== undefined ? <CancelRunModal … /> :
 * null`, which made the whole Studio body a subscriber to `run.session` — a value the stream
 * replaces on *every* line — for the sake of one dialog that is closed almost always. Now the
 * three guard atoms are read here, and RTM-C01 is what makes that pay: the reads below the guard
 * never happen while the dialog is shut, so a closed `CancelRunModal` subscribes to `cancelPrompt`
 * and nothing else, and the 10 Hz clock reaches this component only while it is on screen.
 */
export const CancelRunModal = reatomComponent(function CancelRunModal() {
  const { inputs, run } = useStudioModel()

  // RTM-C02: both handlers are invoked from a DOM event, outside the frame this render is in.
  // They are declared above the guards because they are hooks, and a hook after a conditional
  // return is a React error — `useAction` binds an action to a frame and reads no atom, so
  // hoisting it costs the lazy-read discipline below nothing.
  const keepRunning = useAction(run.keepRunning)
  const confirmCancel = useAction(run.confirmCancel)

  // RTM-C01: the guards first, and every value the body draws only after them. They read into a
  // view rather than returning early, so `4A`'s 120 ms departure has something to draw — see
  // `useModalExit`. A shut dialog still reads `cancelPrompt` and nothing else, and the 10 Hz clock
  // still reaches this component only while it is on screen.
  const view = ((): CancelRunView | undefined => {
    if (!run.cancelPrompt()) return undefined
    if (!run.running()) return undefined
    const session = run.session()
    if (session === undefined) return undefined
    return {
      title: `Cancel run #${session.runNumber ?? 0}?`,
      elapsed: formatElapsed(run.elapsedMs()),
      nodeId: run.runningNodeId() ?? inputs.startId() ?? '',
    }
  })()

  const exit = useModalExit(view)
  if (exit === undefined) return null

  const { title, elapsed, nodeId } = exit.view

  const actions = (
    <>
      <Button variant="quiet" size="modal" onClick={keepRunning}>
        Keep running
      </Button>
      <Button variant="destructive" size="modal" onClick={confirmCancel}>
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
      onDismiss={keepRunning}
      leaving={exit.leaving}
      onExited={exit.onExited}
    >
      <div className={s.titleRow}>
        <Spinner size={11} data-testid="cancel-run-spinner" />
        <h2 className={s.title}>{title}</h2>
        <div className={s.spacer} />
        <div data-testid="cancel-run-elapsed" className={s.elapsed}>
          {elapsed}
        </div>
      </div>
      <ProseText
        data-testid="cancel-run-message"
        segments={cancelRunMessage(nodeId)}
        tone="lifted"
        className={s.message}
      />
    </ModalShell>
  )
}, 'CancelRunModal')
