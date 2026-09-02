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
 * **The three outcomes stay three.** `RunModel.history` collapses `cancelled` into `failed`
 * because `2A`'s history rows draw two tones; a toast that reused it would tell the user a run
 * they cancelled had failed. So this reads {@link RunModel.archive} — whole sessions, with the
 * report's own `ok | failed | cancelled` — and says which of the three actually happened.
 *
 * ## The trigger is the archive's head, and it needs no "skip the first"
 *
 * A run joins the archive exactly once, as it settles, newest first, and the archive starts empty
 * and is cleared on a flow switch. So `effect` over its head fires once per settled run: at mount
 * and after a switch the head is `undefined`, which raises nothing, and every later change is a
 * run that has just finished in this session. Nothing here polls, and nothing counts.
 */

/** `demo.dc.html:406` — how long the toast stands before it begins to leave. */
export const TOAST_HOLD_MS = 2800

/**
 * `4A`'s 120ms exit, in the one place it cannot be read from CSS: the surface must outlive
 * `visible` going `false` by exactly the length of its own fade, or it unmounts mid-exit and the
 * 120ms plays to nobody. The stylesheet reads `--jbk-motion-duration-exit` for the fade itself;
 * this is the same number and `toast.test.ts` is what holds the two together.
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

  /** The head of the archive — the run that settled most recently, or nothing yet. */
  const settled = computed<RunSession | undefined>(() => input.archive()[0], `${name}.settled`)

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
        const next = messageFor(session)
        if (next === undefined) return
        detached(_show(next))
      })
      return () => {
        raised()
      }
    }),
  )

  /**
   * What the surface's own dismissal and a flow switch both call. The frame is aborted rather than
   * left running, for the same reason `OutputModel.reset` aborts its holds: a hold that outlived
   * its toast would clear a later one.
   */
  const dismiss = action(() => {
    _show.abort()
    visible.set(false)
    message.set(undefined)
  }, `${name}.dismiss`)

  return { message, visible, dismiss }
}
