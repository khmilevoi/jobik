import { cx } from '#cx.js'
import type { ButtonState } from '#primitives/Button/Button.js'
import { CheckIcon } from '#primitives/icons/CheckIcon.js'
import { CopyIcon } from '#primitives/icons/CopyIcon.js'
import { Spinner } from '#primitives/Spinner/Spinner.js'
import s from './ValueRow.module.css'

/** The value row is a copy shape; `3A` never draws it transferring. */
export type ValueRowState = Exclude<ButtonState, 'progress'>

export interface ValueRowProps {
  /** The value itself — a URL, a checksum. Shown while idle and while working. */
  readonly value: string
  readonly state?: ValueRowState
  /**
   * What replaces the value once it is on the clipboard. Defaults to the string the artboard
   * draws, so four call sites cannot each invent a different one; override it where the row holds
   * something other than a URL.
   */
  readonly copiedLabel?: string
  /** What replaces the value when the browser refuses the write. Defaults to the artboard's. */
  readonly failedLabel?: string
  /** The trailing button's accessible name. */
  readonly copyLabel?: string
  readonly onCopy?: () => void
  readonly className?: string
  readonly 'data-testid'?: string
}

const states = {
  idle: '',
  busy: s.busy,
  ok: s.ok,
  failed: s.failed,
} satisfies Record<ValueRowState, string>

/**
 * `3A`'s `Value row · field · trailing` — a mono value with a copy action seated in its right
 * edge.
 *
 * The failed cell has no trailing slot at all: the design drops it and re-centres the padding,
 * because a clipboard the browser has blocked is not something a second press fixes. Everything a
 * caller might want to retry with lives in the state it passes.
 */
export function ValueRow(props: ValueRowProps) {
  const {
    value,
    state = 'idle',
    copiedLabel = 'copied to clipboard',
    failedLabel = 'clipboard blocked by the browser',
    copyLabel = 'Copy',
  } = props

  const text = state === 'ok' ? copiedLabel : state === 'failed' ? failedLabel : value

  return (
    <div data-testid={props['data-testid']} className={cx(s.row, states[state], props.className)}>
      <span className={s.value}>{text}</span>
      {state === 'failed' ? null : (
        <button type="button" aria-label={copyLabel} onClick={props.onCopy} className={s.trailing}>
          {state === 'busy' ? <Spinner size={10} /> : null}
          {state === 'ok' ? <CheckIcon size={10} /> : null}
          {state === 'idle' ? <CopyIcon size={10} /> : null}
        </button>
      )}
    </div>
  )
}
