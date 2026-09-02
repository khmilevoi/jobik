import { reatomComponent } from '@reatom/react'
import { cx } from '#cx.js'
import { useStudioModel } from '#model/context.js'
import type { ToastTone } from '#model/types.js'
import s from './RunToast.module.css'

/**
 * F-C13 — the toast a settled run raises, bottom-left of the shell.
 *
 * `4A`'s coverage grid is the whole specification of its motion: *"Toasts and errors — 140 ms in,
 * 120 ms out, no slide; they appear where they will stay."* So this fades and does nothing else.
 * The demo prototype (`.design/raw/demo.dc.html:318-321`) draws the surface and *does* lift it 4px
 * on the way in; `4A` is the newer statement and forbids that, so the transform is not here. Where
 * the two disagree, the artboard wins.
 *
 * ## What it says, and why every word of it is a read
 *
 * `Run #221 finished in 2.4s` · `Run #221 failed` · `Run #221 cancelled` — the prototype's own
 * three lines, and `model/toast.ts` builds each from the report that settled the run. Nothing is
 * synthesised, which is the only reason this surface exists at all: `4A` names a toast, and a
 * toast that had to invent its own content would be chrome pretending to be information.
 *
 * It reads the model and takes no props, like `ProblemsStrip`: the message is
 * `ToastModel.message` and the fade is `ToastModel.visible`, which are two units rather than one
 * because the exit is 120ms long and the element has to still be mounted while it plays.
 */

const toneDots = {
  ok: s.dotOk,
  failed: s.dotFailed,
  mute: s.dotMute,
} satisfies Record<ToastTone, string>

export const RunToast = reatomComponent(() => {
  const { toast } = useStudioModel()
  const message = toast.message()
  if (message === undefined) return null

  return (
    // `aria-live="polite"`: the toast is the only report some run outcomes get, and it is not a
    // control — nothing in it can be reached or dismissed by hand, exactly as the prototype draws
    // it, so a reader that never sees it must still be told.
    <div
      data-testid="studio-run-toast"
      data-tone={message.tone}
      aria-live="polite"
      /*
       * Load-bearing, and `ModalShell` carries it for exactly the same reason: every `--jbk-*`
       * custom property is declared under `[data-jobik-studio]`, and `StudioApp` renders this as a
       * sibling of `<Studio />` rather than inside the frame — because a toast that lived in the
       * frame would be clipped by its `overflow:hidden`. Without the marker the surface resolves
       * none of its tokens and paints bare: no fill, no border, no shadow, no transition, and the
       * browser's serif for the text. Measured, not hypothetical.
       */
      data-jobik-studio=""
      className={cx(s.toast, toast.visible() && s.visible)}
    >
      <div className={cx(s.dot, toneDots[message.tone])} />
      <div className={s.text}>{message.text}</div>
    </div>
  )
}, 'RunToast')
