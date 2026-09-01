import { action, atom, onEvent, withConnectHook } from '@reatom/core'
import type {
  OutputModel,
  RunModel,
  SaveModel,
  ShortcutsModel,
  StudioDeps,
  ValidationModel,
} from './types.js'

/**
 * The four global keys `RunPanel` renders and binds none of: `⌘↵`, `⌘⇧V`, `⌘S`, `esc`.
 *
 * `### Run panel`: P11 draws `⌘↵` and `esc` as hints and wires neither, so the binding has always
 * been the shell's. In `StudioApp` it was a `useEffect` holding an `addEventListener`/
 * `removeEventListener` pair and a nine-entry dependency list, which is exactly the shape RTM-L01
 * exists to remove: the listener's lifetime is a connection, and a connection has a hook that
 * returns its own cleanup.
 *
 * Two things follow from that, and both are deliberate:
 *
 *  * **The listener is installed while something is connected to {@link ShortcutsModel.bound}, and
 *    at no other time.** A Studio that is not on screen binds no global key. `bound` is not a
 *    report the model keeps by hand beside the listener — it *is* the connection, written by the
 *    hook that owns it.
 *  * **`onKeyDown` is the whole of the behaviour and takes an event.** A test drives it directly
 *    rather than dispatching on `globalThis` and hoping, and the listener is then one line with
 *    nothing in it to get wrong. The one case that does need a real dispatch — that the listener is
 *    installed at all, and removed again — is asserted through `bound` and a dispatched event.
 *
 * `deps` is on the signature and unused: every sub-model factory takes the same three arguments so
 * `reatomStudio` wires them all the same way. Nothing here reaches outside the model.
 */
export function reatomShortcuts(
  _deps: StudioDeps,
  input: {
    run: RunModel
    save: SaveModel
    validation: ValidationModel
    output: OutputModel
  },
  name: string,
): ShortcutsModel {
  const { run, save, validation, output } = input

  /**
   * `esc` has a priority order, and it is behaviour rather than decoration.
   *
   *  1. A modal that already answered the press has called `preventDefault()` on the way up (see
   *     `ModalShell`), and is skipped. Without this, dismissing `3F`'s dialog while a run streamed
   *     also opened `Cancel run #221?` off the same press, and `esc` out of that one re-opened it
   *     forever.
   *  2. R33 — the `Output viewer` artboard draws `Copy all` and `Download` and no close control of
   *     its own, so `esc` is the least-invented way to keep it closable. It takes priority over
   *     cancelling a run, since the viewer only ever opens once a run has already settled.
   *  3. Only then does a run in flight open the cancel dialog. `3C`: every affordance that used to
   *     cancel now asks, and only the dialog's own destructive primary sends the request.
   *
   * `⌘↵` guards on `running` rather than on a start node: `run.start` already refuses without a
   * `startId`, a descriptor or a saved document, so the only guard this layer still owes is the one
   * that keeps a press during a run from filing an F02 finding about a draft nobody asked to run.
   */
  const onKeyDown = action((event: KeyboardEvent) => {
    const meta = event.metaKey || event.ctrlKey

    if (meta && event.key === 'Enter') {
      event.preventDefault()
      if (!run.running()) run.runFromDraft()
      return
    }

    // `3D`'s status strip is the only place the design names this shortcut.
    if (meta && event.shiftKey && event.key.toLowerCase() === 'v') {
      event.preventDefault()
      validation.validate()
      return
    }

    if (meta && event.key.toLowerCase() === 's') {
      event.preventDefault()
      // `save()` answers every refusal — locked, no flow, no draft, already saving — by returning
      // with `state` untouched, so this needs no guard of its own. The promise is nobody's to
      // await here; a floating rejection is not.
      void save.save().catch(() => {})
      return
    }

    if (event.key === 'Escape') {
      if (event.defaultPrevented) return
      // `esc` puts the dock away as `2A`'s 34px strip, which is the same thing its own `×` does
      // and the same thing the dock's own `esc` listener does — one gesture, one outcome. A dock
      // already collapsed has nothing left to dismiss, so `esc` falls through to the run.
      if (output.viewerNodeId() !== undefined && !output.collapsed()) {
        output.collapse()
        return
      }
      if (run.running()) run.askToCancel()
    }
  }, `${name}.onKeyDown`)

  /**
   * RTM-A06 and RTM-L01 together, and the reason they are one line rather than two: `onEvent` is
   * the bridge that puts the DOM event back inside the frame, and the connect hook is the owner
   * that returns cleanup. A bare `addEventListener` would satisfy neither, and a module-level
   * `effect` holding the listener would satisfy the first and fail the second (RTM-L02).
   *
   * The callback is handed to Reatom's own bridge, so it is already frame-bound and must **not** be
   * wrapped again (RTM-A04's own exception).
   */
  const bound = atom(false, `${name}.bound`).extend(
    withConnectHook(() => {
      const off = onEvent(globalThis, 'keydown', (event) => {
        onKeyDown(event)
      })
      bound.set(true)
      return () => {
        off()
        bound.set(false)
      }
    }),
  )

  return { onKeyDown, bound }
}
