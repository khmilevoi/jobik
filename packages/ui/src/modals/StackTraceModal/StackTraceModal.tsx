import type { StackFrame } from '@jobik/core'
import { reatomComponent, useWrap } from '@reatom/react'
import { Fragment } from 'react'
import { ModalShell } from '#modals/ModalShell/ModalShell.js'
import { useModalExit } from '#modals/modalExit.js'
import { type ProseSegment, ProseText } from '#modals/ProseText/ProseText.js'
import { useStudioModel } from '#model/context.js'
import { CheckIcon } from '#primitives/icons/CheckIcon.js'
import { CopyIcon } from '#primitives/icons/CopyIcon.js'
import { DownloadIcon } from '#primitives/icons/DownloadIcon.js'
import { Button } from '#primitives/index.js'
import s from './StackTraceModal.module.css'

/** §4 — `node` and `input` are lifted; `runtime` stays muted. The design draws no third tone. */
export type StackTraceMetaTone = 'lifted' | 'muted'

export interface StackTraceMetaEntry {
  /** The mono label in the 110 px column — `node`, `input`, `runtime`. */
  readonly label: string
  /** The mono value — `render · imageOut`, `markdown · 1.4 kb`, `0.9.2 · node 20.11`. */
  readonly value: string
  readonly tone: StackTraceMetaTone
}

/**
 * Everything the dialog draws, read in one place so `4A`'s 120 ms departure has a last frame to
 * hold — the shape `SwitchFlowBody` already has for `3F`.
 *
 * `model/runPanel.ts` owns the values and this file owns the shape, which is why the type is
 * declared beside the component and `model/types.ts` imports it rather than the other way round.
 *
 * **What is absent is as deliberate as what is here.** There is no `input` and no `runtime` meta
 * row: no wire field carries a failed node's input or its byte size, and neither version is on any
 * payload. `RunPanelModel.trace` states each omission at the point it is made.
 */
export interface StackTraceView {
  readonly readOnly?: boolean
  /** The mono context line, e.g. `render · run #220 · 0.8s`. */
  readonly context: string
  /** The error class, mono and PascalCase — e.g. `ImageRenderError`. */
  readonly errorClass: string
  /** The sentence under it, with the one identifier the payload names set in mono. */
  readonly errorMessage: readonly ProseSegment[]
  /** `NodeExecutionError.frames`, straight off `wireErrorFrames()`. */
  readonly frames: readonly StackFrame[]
  /**
   * The trimmed-frame line, already formatted, or `undefined` when nothing was trimmed.
   *
   * It arrives as a string rather than as `wireErrorFrames().hiddenFrames` for one reason: the
   * count is real — `server/stackFrames.ts` computes it and `runWire.ts` sends it — but the frames
   * behind it are not, so this line is a read-out and never `3C`'s `↳ show 6 hidden frames` link.
   * `run/format.ts`'s `formatHiddenFrames` is the design's own wording for exactly that,
   * `↳ 6 frames hidden`, and `modals/` does not depend on `run/`, so the model spells it.
   */
  readonly hiddenFrames?: string
  readonly meta: readonly StackTraceMetaEntry[]
  /**
   * The settled half of `3A`'s copy sequence. The artboard draws the header's control **only** in
   * its `Copied` state, so this is the state the model owns: press → copy → hold 1.6 s → false.
   */
  readonly copied: boolean
}

/** Written out in full so a missing tone is a type error and every read is visible to the gate. */
const metaTones = {
  lifted: s.metaValueLifted,
  muted: s.metaValueMuted,
} satisfies Record<StackTraceMetaTone, string>

/**
 * `3C` Modal C — **Stack trace**, `640px`, the widest. `09-modals.md` §4.
 *
 * It is the one modal that is genuinely feedable from v1's wire: `wireErrorFrames()` unpacks a
 * `NodeExecutionError`'s `frames` and `hiddenFrames`, and a `StackFrame` is exactly the
 * `fn` / `file` / `line` the artboard prints as `at imageOut.raster (imageOut.ts:184)`.
 *
 * The header control is the settled `Copied` confirmation the artboard draws. Its idle state is
 * not drawn in `3C`, so it borrows the one `3A` §2.2 fixes — the 24 × 24 icon-only ghost with
 * `title="Copy"` — rather than inventing a label for it.
 *
 * ## It reads the model, and it owns its own open guard
 *
 * This is the last of `3C`'s four dialogs to get a render site, and it gets it the way the other
 * three have one: `StudioApp` mounts `<StackTraceModal />` unconditionally and the guard lives
 * here. `RunPanelModel.trace` is the whole of what it draws, `openTrace` is what the failed node
 * card's `View trace` presses, and `closeTrace` is `esc`, the `×` and a backdrop click.
 *
 * RTM-C01 is what makes that pay: `trace` answers `undefined` the moment the dialog is shut, so a
 * closed dialog subscribes to that one computed and to nothing underneath it — not to the failed
 * session, not to the descriptor and not to the copy hold.
 *
 * **Every control here does what it says.** `Copy` and `Save trace` write the same text,
 * `Retry node` is the failed card's own `run.retryNode`, and the two meta rows the artboard draws
 * beside `node` are not rendered at all rather than filled with a plausible value — see
 * {@link StackTraceView}.
 */
export const StackTraceModal = reatomComponent(function StackTraceModal() {
  const { runPanel } = useStudioModel()

  /**
   * RTM-C02: each press reaches a Reatom action from a DOM event, outside the frame this render is
   * in, so each is wrapped into the model's frame. They are declared above the guard because they
   * are hooks, and a hook after a conditional return is a React error.
   */
  const copy = useWrap(() => {
    runPanel.copyTrace()
  }, 'StackTraceModal.copy')

  const saveTrace = useWrap(() => {
    runPanel.saveTrace()
  }, 'StackTraceModal.saveTrace')

  const retryNode = useWrap(() => {
    runPanel.retryTraceNode()
  }, 'StackTraceModal.retryNode')

  const dismiss = useWrap(() => {
    runPanel.closeTrace()
  }, 'StackTraceModal.dismiss')

  // The guard first, and every value the body draws only after it. `useModalExit` holds the last
  // frame so `4A`'s 120 ms departure has something to draw.
  const exit = useModalExit(runPanel.trace())
  if (exit === undefined) return null

  const view = exit.view
  const numbered = view.frames.map((frame, index) => ({ frame, number: index + 1 }))

  const copyControl = view.copied ? (
    <div data-testid="trace-copied" className={s.copied}>
      <CheckIcon />
      Copied
    </div>
  ) : (
    <button
      type="button"
      title="Copy"
      aria-label="Copy"
      data-testid="trace-copy"
      className={s.copy}
      onClick={copy}
    >
      <CopyIcon />
    </button>
  )

  const actions = (
    <>
      <Button
        variant="quiet"
        size="modal"
        icon={<DownloadIcon strokeWidth={1.2} />}
        onClick={saveTrace}
      >
        Save trace
      </Button>
      {view.readOnly === true ? null : (
        <Button variant="destructive" size="modal" onClick={retryNode}>
          Retry node
        </Button>
      )}
    </>
  )

  return (
    <ModalShell
      data-testid="stack-trace-modal"
      title="Stack trace"
      width={640}
      bodyGap={12}
      header={{
        lead: <div className={s.failedDot} />,
        context: view.context,
        extra: copyControl,
        onClose: dismiss,
      }}
      hint="esc to close"
      actions={actions}
      onDismiss={dismiss}
      leaving={exit.leaving}
      onExited={exit.onExited}
    >
      <div className={s.errorBlock}>
        <div data-testid="trace-error-class" className={s.errorClass}>
          {view.errorClass}
        </div>
        <ProseText
          data-testid="trace-error-message"
          segments={view.errorMessage}
          className={s.errorMessage}
        />
      </div>

      {/*
        The block is drawn only when it has something in it. `3C` always draws frames, and every
        wire payload that carries a *thrown* failure does too — but an expected failure a handler
        `return`s (which is the repository's own `errore` convention, and what the showcase's
        `ImageRenderError` is) reaches the client with no `frames` array at all. Rendering the
        bordered well regardless left an empty box under the error, which no artboard has.
      */}
      {numbered.length === 0 && view.hiddenFrames === undefined ? null : (
        <div data-testid="trace-frames" className={s.frameList}>
          {numbered.map(({ frame, number }) => (
            <div key={`${number}:${frame.fn}`} data-testid="trace-frame">
              <span className={s.gutter}>{`${number} `}</span>
              {`at ${frame.fn} (`}
              <span className={s.frameSource}>{`${frame.file}:${frame.line}`}</span>
              {')'}
            </div>
          ))}
          {/*
          `3C` draws this as an accent link — `↳ show 6 hidden frames` — and it cannot be one: the
          server counts the frames it trimmed and never sends them, so a press could reveal nothing.
          The design has its own static form of the same line, `Run panel — states`' `↳ 6 frames
          hidden`, and that is what the count is drawn as. The row keeps the accent tone the
          artboard gives it and gives up only the affordance nothing can answer.
        */}
          {view.hiddenFrames === undefined ? null : (
            <div className={s.disclosureRow}>
              <div data-testid="trace-hidden-frames" className={s.disclosure}>
                {view.hiddenFrames}
              </div>
            </div>
          )}
        </div>
      )}

      <div className={s.metaGrid}>
        {view.meta.map((entry) => (
          <Fragment key={entry.label}>
            <div data-testid="trace-meta-label" className={s.metaLabel}>
              {entry.label}
            </div>
            <div data-testid="trace-meta-value" className={metaTones[entry.tone]}>
              {entry.value}
            </div>
          </Fragment>
        ))}
      </div>
    </ModalShell>
  )
}, 'StackTraceModal')
