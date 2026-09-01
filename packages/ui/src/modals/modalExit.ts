import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * What {@link useModalExit} hands back: the view to draw, whether it is on its way out, and the
 * callback the shell calls once the exit animation has finished.
 */
export interface ModalExit<T> {
  readonly view: T
  /** `true` while the model has already closed and only the 120 ms departure is left to play. */
  readonly leaving: boolean
  readonly onExited: () => void
}

/**
 * Keeps a dialog's last view alive for the length of its exit, and for no longer.
 *
 * `4A` (`.design/raw/studio.dc.html:181-193`) gives the overlay `200 ms` in and `120 ms` out, and
 * an out phase presupposes the element survives the dismissal. Every dialog here returns `null` the
 * instant its model guard flips, so the `<dialog>` used to leave the DOM in the same tick as the
 * state write and the departure had nowhere to run.
 *
 * The pattern is: read the model into a **view** while the dialog is open, hand that view to this
 * hook, and draw whatever it returns. While the model is open the live view comes straight back.
 * When the model closes, the last committed view comes back once more with `leaving: true`, and
 * `ModalShell` calls `onExited` when the card's own exit animation ends — which is what finally
 * drops it.
 *
 * **Rule 04 — *"a transition never delays a result"* — is why the model closes first and this hook
 * holds only the picture.** The action fires, the atom is written and every other surface has
 * already moved on; what lingers for 120 ms is one fading element that nothing else waits for.
 *
 * **The hold is measured, not assumed.** `ModalShell` reads the exit duration off the card's own
 * computed style, so `prefers-reduced-motion` — which zeroes `--jbk-motion-duration-exit` in
 * `globalStyles.css` — removes the hold along with the animation, and an environment that applies
 * no stylesheet at all (jsdom, and so every test in this package) unmounts synchronously exactly as
 * it did before.
 *
 * The view is captured in an effect rather than during render: by the time the closing render runs,
 * the model has nothing left to read, and the value committed by the previous render is the one the
 * user was looking at.
 */
export function useModalExit<T>(view: T | undefined): ModalExit<T> | undefined {
  const held = useRef<T | undefined>(undefined)
  const [exited, setExited] = useState(false)

  useEffect(() => {
    if (view === undefined) return
    held.current = view
    // A no-op while it is already `false`; React bails out of the re-render.
    setExited(false)
  })

  const onExited = useCallback(() => {
    held.current = undefined
    setExited(true)
  }, [])

  if (view !== undefined) return { view, leaving: false, onExited }
  if (exited) return undefined
  const last = held.current
  if (last === undefined) return undefined
  return { view: last, leaving: true, onExited }
}
