import { action, atom, computed, sleep, withAbort, withConnectHook, wrap } from '@reatom/core'
import { formatElapsed } from '#studio/format.js'
import type { RunSession } from '#studio/runSession.js'
import { detached } from './reatom.js'
import type { RunModel, StudioDeps, ToastMessage, ToastModel } from './types.js'

/**
 * F-C13 — the one surface `4A` names that the package did not have.
 *
 * `4A`'s coverage grid is where it comes from: *"Toasts and errors — 140 ms in, 120 ms out, no
 * slide; they appear where they will stay."* The demo prototype draws the surface
 * (`.design/raw/demo.dc.html:318-321`) and its script raises one as a run settles
 * (`:455-467` — `Run #N finished in 2.4s`, `Run #N failed`), holds it 2.8 s, then fades it out.
 *
 * ## Why this one is honest and the deferred ones are not
 *
 * Everything it prints is on the wire and nothing is synthesised: the run number, the outcome and
 * the elapsed all come off the report that settled the run, which is the same report the run
 * history row and the run panel already read. That is the whole test — a surface that had to
 * invent a number to fill itself would be a hollow one, and `output/tabs.ts` records what happens
 * to those.
 *
 * **The three outcomes stay three.** A settled report's `status` is `ok | failed | cancelled`, and
 * the toast is the only report some runs get — so it must say which of the three actually
 * happened, never fold two of them together the way a surface with two tones has to. That is why
 * it reads {@link RunModel.archive}: whole sessions, each still carrying the report that settled
 * it, rather than a projection shaped for somewhere else.
 *
 * ## The trigger is a run this model has not announced yet, not a change of the head
 *
 * The archive's head is **not**, on its own, a run that has just finished. {@link RunModel.archive}
 * is the active flow's slice of a map keyed by flow (`run.ts:211-224`), so selecting another flow
 * swaps the entire list: the head jumps to a run that settled minutes ago, or — coming back —
 * returns to one this toast has already spoken about. Anything watching the head alone announces
 * both as fresh. (It was safe once: the archive really was cleared on a switch, until `8bb405c`
 * keyed it by flow so that returning to a flow restores its `Runs` group.)
 *
 * So the guard is the settled session's own identity. A run joins the archive exactly once, as it
 * settles, and `archiveSettled` stores that object and never rebuilds it (`run.ts:362-371`) — the
 * object *is* the run, more exactly than a run number, which repeats across flows. Every session
 * already announced goes into a `WeakSet` and a head found in it raises nothing. Nothing here
 * polls, and nothing counts.
 */

/** `demo.dc.html:406` — how long the toast stands before it begins to leave. */
export const TOAST_HOLD_MS = 2800

/**
 * `4A`'s 120ms exit, in the one place it cannot be read from CSS: the surface must outlive
 * `visible` going `false` by exactly the length of its own fade, or it unmounts mid-exit and the
 * 120ms plays to nobody. The stylesheet reads `--jbk-motion-duration-exit` for the fade itself;
 * this is the same number written a second time.
 *
 * One assertion holds the copy to the token — `toast.test.ts`'s *"the exit constant and the token
 * the stylesheet reads / are the same duration"*. It has to be that shape: every timing case in
 * that file measures with this constant, so all of them stay green whatever it says.
 */
export const TOAST_EXIT_MS = 120

/** The line the demo prints for a settled run, and the tone of its 5px dot. */
function messageFor(session: RunSession): ToastMessage | undefined {
  const report = session.report
  if (report === undefined) return undefined
  const number = `Run #${report.runNumber}`
  if (report.status === 'ok') {
    return { text: `${number} finished in ${formatElapsed(report.elapsedMs)}`, tone: 'ok' }
  }
  if (report.status === 'cancelled') return { text: `${number} cancelled`, tone: 'mute' }
  return { text: `${number} failed`, tone: 'failed' }
}

/**
 * `deps` is on the signature because the contract declares it and `reatomStudio` wires every
 * factory the same way; nothing here reads it. A toast is a statement about a run that already
 * settled, so this module asks the server for nothing.
 */
export function reatomToast(
  _deps: StudioDeps,
  input: { archive: RunModel['archive'] },
  name: string,
): ToastModel {
  const message = atom<ToastMessage | undefined>(undefined, `${name}.message`)
  const visible = atom(false, `${name}.visible`)

  /** The head of the archive — the newest run of the flow now selected, or nothing yet. */
  const settled = computed<RunSession | undefined>(() => input.archive()[0], `${name}.settled`)

  /**
   * Every settled session this model has already spoken about. See the header: the head moving is
   * not the same event as a run finishing, and this is what tells the two apart.
   *
   * It is a `WeakSet` so a flow's archive can be dropped without this holding it alive, and it
   * lives in the factory rather than in the connect hook below — a surface that unmounts and
   * mounts again must not re-announce the run standing at the head when it left.
   */
  const announced = new WeakSet<RunSession>()

  /**
   * The whole life of one toast: it is drawn, it stands, it fades, it goes.
   *
   * RTM-A05 — both holds are `await wrap(sleep(ms))` inside an action extended with `withAbort()`,
   * never a `setTimeout`/`clearTimeout` pair. That is also what makes a second run settling during
   * the first toast's hold safe: `withAbort()` drops the frame in flight rather than racing it, so
   * the message is overwritten in place and the surface never unmounts under new text.
   */
  const _show = action(async (next: ToastMessage) => {
    message.set(next)
    visible.set(true)
    await wrap(sleep(TOAST_HOLD_MS))
    // `4A` rule 03 — the exit is shorter than the entrance, and it is opacity alone. The element
    // has to still be here while it plays, so the unmount waits out its own fade.
    visible.set(false)
    await wrap(sleep(TOAST_EXIT_MS))
    message.set(undefined)
  }, `${name}._show`).extend(withAbort())

  /**
   * The reaction, installed by a `withConnectHook` on the atom every reader touches (RTM-L01), so
   * it lives exactly as long as something is drawing the toast. The surface mounts on `message`,
   * so connecting the toast at all is what arms this and there is no way to draw one without it.
   *
   * **It is a subscription rather than an `effect`, and that is not a style choice.** Two shapes
   * were tried against this and both fail in ways nothing reports: an async action started from
   * inside an `effect` body inherits that run's abort scope, so its frame is cancelled the moment
   * the run ends and the writes never land; and an `effect` that does the waiting itself leaks its
   * own supersession as an unhandled `AbortError` every time a second run settles. A subscriber
   * starts nothing of its own, so the sequence above stays an ordinary action with an ordinary
   * abort — and `detached` swallows exactly the one rejection it can produce.
   */
  message.extend(
    withConnectHook(() => {
      const raised = settled.subscribe((session) => {
        if (session === undefined) return
        if (announced.has(session)) return
        announced.add(session)
        const next = messageFor(session)
        if (next === undefined) return
        detached(_show(next))
      })
      return () => {
        raised()
        // Nothing is drawing the toast any more, and nothing else in the model owns one. The hold
        // in flight has no surface left to fade and would clear a later toast if it were allowed
        // to finish, so it is aborted here rather than left running — the same reason
        // `OutputModel.reset` aborts its own holds — and the pair goes back to saying nothing.
        _show.abort()
        visible.set(false)
        message.set(undefined)
      }
    }),
  )

  return { message, visible }
}
