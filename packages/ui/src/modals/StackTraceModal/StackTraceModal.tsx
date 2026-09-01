import type { StackFrame } from '@jobik/core'
import { reatomComponent } from '@reatom/react'
import { Fragment } from 'react'
import { ModalShell } from '#modals/ModalShell/ModalShell.js'
import { type ProseSegment, ProseText } from '#modals/ProseText/ProseText.js'
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

export interface StackTraceModalProps {
  /** The mono context line, e.g. `render · run #220 · 0.8s`. */
  readonly context: string
  /** The error class, mono and PascalCase — e.g. `ImageRenderError`. */
  readonly errorClass: string
  /** The sentence under it, with its identifiers marked mono. */
  readonly errorMessage: readonly ProseSegment[]
  /** `NodeExecutionError.frames`, straight off `wireErrorFrames()`. */
  readonly frames: readonly StackFrame[]
  /** `wireErrorFrames().hiddenFrames`. Zero draws no disclosure. */
  readonly hiddenFrames: number
  readonly onShowHiddenFrames?: () => void
  readonly meta: readonly StackTraceMetaEntry[]
  /**
   * The settled half of `3A`'s copy sequence. The artboard draws the header's control **only** in
   * its `Copied` state, so this is the state the caller owns: press → copy → hold 1.6 s → false.
   */
  readonly copied: boolean
  readonly onCopy?: () => void
  readonly onSaveTrace?: () => void
  readonly onRetryNode?: () => void
  /** `esc`, the `×` and a backdrop click all land here — this dialog is not destructive. */
  readonly onDismiss: () => void
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
 * **It keeps its prop API for the same reason `DownloadModal` does: nothing renders it.** A failed
 * node surfaces its error in the run panel and on the card, and no code path opens this dialog, so
 * there is no unit holding the frames it draws and none holding its `copied` confirmation. Wrapped
 * and otherwise untouched; a model home is what it needs first, not a `reatomComponent` reading
 * one that had to be invented for it.
 */
export const StackTraceModal = reatomComponent(function StackTraceModal(
  props: StackTraceModalProps,
) {
  const numbered = props.frames.map((frame, index) => ({ frame, number: index + 1 }))

  const copyControl = props.copied ? (
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
      onClick={props.onCopy}
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
        onClick={props.onSaveTrace}
      >
        Save trace
      </Button>
      <Button variant="destructive" size="modal" onClick={props.onRetryNode}>
        Retry node
      </Button>
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
        context: props.context,
        extra: copyControl,
        onClose: props.onDismiss,
      }}
      hint="esc to close"
      actions={actions}
      onDismiss={props.onDismiss}
    >
      <div className={s.errorBlock}>
        <div data-testid="trace-error-class" className={s.errorClass}>
          {props.errorClass}
        </div>
        <ProseText
          data-testid="trace-error-message"
          segments={props.errorMessage}
          className={s.errorMessage}
        />
      </div>

      <div data-testid="trace-frames" className={s.frameList}>
        {numbered.map(({ frame, number }) => (
          <div key={`${number}:${frame.fn}`} data-testid="trace-frame">
            <span className={s.gutter}>{`${number} `}</span>
            {`at ${frame.fn} (`}
            <span className={s.frameSource}>{`${frame.file}:${frame.line}`}</span>
            {')'}
          </div>
        ))}
        {props.hiddenFrames === 0 ? null : (
          <div className={s.disclosureRow}>
            <button
              type="button"
              data-testid="trace-hidden-frames"
              className={s.disclosure}
              onClick={props.onShowHiddenFrames}
            >
              {`↳ show ${props.hiddenFrames} hidden frame${props.hiddenFrames === 1 ? '' : 's'}`}
            </button>
          </div>
        )}
      </div>

      <div className={s.metaGrid}>
        {props.meta.map((entry) => (
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
