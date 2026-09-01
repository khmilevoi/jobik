import { reatomComponent } from '@reatom/react'
import type { ReactNode } from 'react'
import { cx } from '#cx.js'
import type { ButtonState } from '#primitives/Button/Button.js'
import { CheckIcon } from '#primitives/icons/CheckIcon.js'
import { Spinner } from '#primitives/Spinner/Spinner.js'
import s from './InlineAction.module.css'

/**
 * `3A` draws the inline link in four states and never in a transferring one — a link that starts a
 * download is not one of the shapes the artboard gives a percentage to.
 */
export type InlineActionState = Exclude<ButtonState, 'progress'>

export interface InlineActionProps {
  readonly children: ReactNode
  readonly state?: InlineActionState
  readonly onClick?: () => void
  readonly disabled?: boolean
  readonly className?: string
  readonly 'data-testid'?: string
}

const states = {
  idle: '',
  busy: s.busy,
  ok: s.ok,
  failed: s.failed,
} satisfies Record<InlineActionState, string>

/**
 * The mono inline action — `3A`'s `Inline link · node footer · mono` row.
 *
 * Its indicators are the smallest the design draws: an 8 px ring while working, a 9 px check at
 * `stroke-width` 1.5 once copied. Both sizes are stated by `08-buttons.md` §1 and §2.3 and are the
 * reason the ring has an 8 px step at all.
 */
export const InlineAction = reatomComponent(function InlineAction(props: InlineActionProps) {
  const { children, state = 'idle' } = props
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      data-testid={props['data-testid']}
      className={cx(s.inline, states[state], props.className)}
    >
      {state === 'busy' ? <Spinner size={8} /> : null}
      {state === 'ok' ? <CheckIcon size={9} strokeWidth={1.5} /> : null}
      {children}
    </button>
  )
}, 'InlineAction')
