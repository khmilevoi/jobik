import { reatomComponent } from '@reatom/react'
import { type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useRef } from 'react'
import { cx } from '#cx.js'
import { CloseIcon } from '#primitives/icons/CloseIcon.js'
import s from './ModalShell.module.css'

/** §1.2 — the four card widths the artboard draws, and the only four. */
export type ModalWidth = 400 | 520 | 560 | 640

/** §1.4 — the four body gaps the artboard draws. `9` is the headerless confirm's. */
export type ModalBodyGap = 9 | 10 | 12 | 14

export interface ModalHeaderSpec {
  /** The mono context line beside the title, e.g. `publication · flow.ts`. */
  readonly context?: ReactNode
  /** The optional leading slot: the stack trace's failed dot. */
  readonly lead?: ReactNode
  /** The slot right of the spacer: count badges, or the settled `Copied` confirmation. */
  readonly extra?: ReactNode
  /** The `×`. Omitted draws no `×` — which is what the destructive confirm does. */
  readonly onClose?: () => void
}

export interface ModalShellProps {
  /**
   * The dialog's accessible name, and the text of the header's own `<h2>` when there is a header
   * band. A headerless modal draws its own title and this still names the dialog.
   */
  readonly title: string
  readonly width: ModalWidth
  /** Omitted draws no header band: `Cancel run` puts its title in the body's first row. */
  readonly header?: ModalHeaderSpec
  readonly bodyGap: ModalBodyGap
  /** The mono hint at the footer's left — `esc to close`, `2 of 3 files · 620 kb`. */
  readonly hint?: ReactNode
  /** The footer's right: secondary first, primary last (rule 03). */
  readonly actions?: ReactNode
  /**
   * Rule 02 — *"clicking the backdrop closes anything non-destructive"*. Set on the one
   * destructive dialog, which then dismisses only by `esc` or an explicit button.
   *
   * Rule 03's other half — *"a destructive primary uses `#c96a5c`"* — is the footer button's, not
   * the shell's: the tone belongs to the button primitive that renders it.
   */
  readonly destructive?: boolean
  /** `esc`, the `×` and (when not destructive) a backdrop click all land here. */
  readonly onDismiss: () => void
  readonly children: ReactNode
  readonly 'data-testid'?: string
}

/** Written out in full so a missing width is a type error and every read is one the gate can see. */
const widths = {
  400: s.width400,
  520: s.width520,
  560: s.width560,
  640: s.width640,
} satisfies Record<ModalWidth, string>

const bodyGaps = {
  9: s.gap9,
  10: s.gap10,
  12: s.gap12,
  14: s.gap14,
} satisfies Record<ModalBodyGap, string>

/**
 * The chrome every `3C` dialog shares: the scrim, the card, the 46 px header band, the body and
 * the 56 px footer.
 *
 * **It is a real `<dialog>` opened with `showModal()`**, which is what `modern-web-guidance`'s
 * *light-dismiss-a-dialog* and *platform-controls-dismiss-dialog* guides prescribe: the top layer,
 * the focus trap, the inert background and the platform's own close requests all come from the
 * element rather than from a hand-rolled trap. `aria-modal` and `aria-label` are set explicitly so
 * the dialog is named even where the header band is absent. Focus is captured before opening and
 * restored on unmount, so dismissing a modal returns the caret to whatever opened it.
 *
 * The scrim is the `<dialog>` itself — full-viewport, `rgba(5,5,6,.72)`, **no blur** (rule 01) —
 * rather than `::backdrop`, for two reasons: `::backdrop` inherits custom properties only in
 * browsers that shipped the 2023 spec change, and a click on the element itself is the
 * backdrop-click test both guides give as the portable fallback. The UA's own `::backdrop` paint
 * is cleared to `transparent` so the two do not stack.
 *
 * `closedby="any"` is deliberately not used. It would give light dismiss declaratively, but it is
 * unsupported in Safari and it cannot express rule 02 — *"clicking the backdrop closes anything
 * non-destructive"* — which is a per-dialog decision the `destructive` prop makes here.
 *
 * **`data-jobik-studio` is on the dialog itself, and it is load-bearing.** Every `--jbk-*` custom
 * property is declared under `[data-jobik-studio]` — `tokens.css` and each directory's
 * `*Tokens.css` — and so is the reset that sets the UI font stack. A modal that does not carry the
 * marker and is not mounted inside something that does resolves *none* of them: the card loses its
 * background, the scrim goes transparent and the text falls back to the browser's serif. That is
 * not hypothetical — `StudioApp` renders its three dialogs as siblings of `<Studio />`, outside the
 * frame that used to be the attribute's only carrier, and every one of them painted bare.
 *
 * It belongs here rather than on a frame slot because `showModal()` puts the dialog in the **top
 * layer**: it is already outside every ancestor stacking context and clip, so nesting it in the
 * frame would buy nothing but the token scope, and would fix only the modals the Studio itself
 * mounts. Custom properties resolve down the DOM tree, not the layout tree, so marking the root
 * makes each modal a self-sufficient scope wherever it is rendered.
 *
 * The one thing that scope cannot inherit is the frame's inline `--accent` override, so a modal
 * outside the frame draws `--jbk-accent` at its default rather than at a caller's alternate.
 *
 * **Motion:** `01-foundations.md` §6.7 records that the design fixes *no* enter, exit or backdrop
 * fade for a modal — "the card is simply present" — so none is invented. The only thing that moves
 * in `3C` is the spinner inside the Cancel-run dialog, which turns because the run is still
 * running.
 *
 * **The `useRef`/`useEffect` pair below stays, and that is a decision rather than an oversight.**
 * Everything else in this wave moved state out of a component and into the model; what this one
 * holds is not application state. `dialogRef` is the element itself and `restoreTo` is
 * `document.activeElement` as it stood when the dialog opened — two DOM facts, scoped to one
 * mount, that no other surface can read, write or benefit from. An atom holding "the element that
 * had focus" would be a model whose only question is about the DOM, and it would answer it for the
 * wrong tree the moment two dialogs existed. So the shell is a `reatomComponent` for uniformity,
 * and its focus capture and restoration are left exactly where they were.
 */
export const ModalShell = reatomComponent(function ModalShell(props: ModalShellProps) {
  const { header, onDismiss } = props
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return
    const restoreTo = document.activeElement
    // `showModal` is the whole point of the element; the `open` branch is for a runtime that
    // implements `<dialog>` without the top layer (jsdom is one), where the dialog still renders
    // and still answers `esc`, but traps no focus.
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else {
      dialog.open = true
      dialog.focus()
    }
    return () => {
      if (dialog.open && typeof dialog.close === 'function') dialog.close()
      if (restoreTo instanceof HTMLElement) restoreTo.focus()
    }
  }, [])

  // `esc` is answered here rather than through the native close request so one path serves both
  // branches above, and so the dialog never closes itself behind the caller's back: dismissal is
  // always the caller's decision. `onCancel` cancels the native request for the same reason.
  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    onDismiss()
  }

  const onBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (props.destructive === true) return
    if (event.target !== event.currentTarget) return
    onDismiss()
  }

  return (
    <dialog
      ref={dialogRef}
      data-jobik-studio=""
      tabIndex={-1}
      aria-modal="true"
      aria-label={props.title}
      data-testid={props['data-testid'] ?? 'modal'}
      className={s.scrim}
      onCancel={(event) => event.preventDefault()}
      onKeyDown={onKeyDown}
      onClick={onBackdropClick}
    >
      <div className={cx(s.card, widths[props.width])}>
        {header === undefined ? null : (
          <header className={s.header}>
            {header.lead === undefined ? null : <div className={s.lead}>{header.lead}</div>}
            <h2 className={s.title}>{props.title}</h2>
            {header.context === undefined ? null : (
              <div data-testid="modal-context" className={s.context}>
                {header.context}
              </div>
            )}
            <div className={s.spacer} />
            {header.extra}
            {header.onClose === undefined ? null : (
              <button
                type="button"
                aria-label="Close"
                data-testid="modal-close"
                className={s.close}
                onClick={header.onClose}
              >
                <CloseIcon />
              </button>
            )}
          </header>
        )}
        <div
          data-testid="modal-body"
          className={cx(header === undefined ? s.bodyHeadless : s.body, bodyGaps[props.bodyGap])}
        >
          {props.children}
        </div>
        <footer className={s.footer}>
          {props.hint === undefined ? null : (
            <div data-testid="modal-hint" className={s.hint}>
              {props.hint}
            </div>
          )}
          <div className={s.spacer} />
          {props.actions}
        </footer>
      </div>
    </dialog>
  )
}, 'ModalShell')
